import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  AlarmClock, ArrowRight, ArrowUp, ArrowUpRight, BellRing, BookOpen, CalendarDays, Check, ChevronDown,
  Eye, EyeOff, Globe, GraduationCap, History, LayoutGrid, LoaderCircle, Mail, MessageSquare, Monitor, Smartphone,
  Plus, RotateCcw, Search, SlidersHorizontal, Square, Trash2, Upload, X,
} from 'lucide-react';
import {HISTORY_KEY, SETTINGS_KEY, readHistory, readPreferences, type HistoryItem, type Preferences} from './history';
import {
  classifyQuestion, detectSearch, hostOf, isTerminal, SOURCE_META, statusLabel, useLiveRun,
  type AnswerBundle, type Evidence, type LiveRun,
} from './live';
import { coverageForKind, coverageSite } from './coverage-catalog.ts';
import { SEARCH_PHASES, searchPhase, type SearchPhase } from './search-architecture.ts';
import './desk.css';

const starterQuestions = [
  {label: 'Course · CSC207 prerequisites', question: 'What are the prerequisites for CSC207H1?'},
  {label: 'Event · Labour Day Carillon Recital', question: 'When and where is the Labour Day Carillon Recital, and is it free?'},
  {label: 'Exam · December 2026 exam period', question: 'When is the Arts & Science December 2026 exam period, and what counts as an exam conflict?'},
  {label: 'Assignment · CSC207 A2 due date', question: 'When is CSC207 Assignment 2 due?'},
];

const FIELD_LABEL: Record<string, string> = {
  requirements: 'Requirement',
  eligibility: 'Who it applies to',
  deadline: 'Deadline',
  event_date: 'Date',
  event_time: 'Time',
  location: 'Location',
  organizer: 'Organizer',
  event_description: 'What it is',
  submission_format: 'Format',
  registration_link: 'Registration',
  community_note: 'Student note',
};

interface ClaimRow {
  id: string;
  field: string;
  text: string;
  status: string;
  evidenceIds: string[];
}

function compactFacts(answer: AnswerBundle): ClaimRow[] {
  const claims = (answer.claims as ClaimRow[]).filter((claim) => claim && typeof claim.text === 'string');
  const seen = new Set<string>();
  const rows: ClaimRow[] = [];
  const rank = (field: string) =>
    ['event_date', 'deadline', 'requirements', 'location', 'eligibility', 'event_time', 'organizer', 'event_description'].indexOf(field);
  const sorted = [...claims].sort((a, b) => {
    const left = rank(a.field);
    const right = rank(b.field);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
  });
  for (const claim of sorted) {
    if (claim.status === 'unknown' || claim.field === 'community_note') continue;
    if (claim.text.length < 28 || /visible link|https?:\/\//i.test(claim.text) || /^ca\//i.test(claim.text)) continue;
    if (claim.field === 'event_description' && rows.some((row) => row.field === 'event_description')) continue;
    const key = `${claim.field}:${claim.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(claim);
    if (rows.length >= 4) break;
  }
  return rows;
}

function pageChip(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return path && path !== '/' ? `${parsed.host}${path}` : parsed.host;
  } catch {
    return hostOf(url);
  }
}

function clip(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

interface SitePane {
  id: string;
  label: string;
  url: string;
  title?: string;
  state: 'live' | 'captured' | 'blocked' | 'waiting';
  detail?: string;
}

function sitePanes(run: LiveRun): SitePane[] {
  const planned = detectSearch(run.question).sourceIds;
  const captured = new Map(run.capturedPages.map((page) => [page.sourceId, page]));
  const failed = new Map(
    run.activities.filter((item) => item.kind === 'failed' && item.sourceId).map((item) => [item.sourceId!, item]),
  );
  const currentHost = hostOf(run.currentUrl ?? undefined);
  const liveId = run.viewerUrl && !run.viewerClosed
    ? planned.find((id) => hostOf(SOURCE_META[id]?.url) === currentHost)
      ?? planned.find((id) => !captured.has(id) && !failed.has(id))
    : undefined;
  return planned.map((id) => {
    const meta = SOURCE_META[id];
    const page = captured.get(id);
    const fail = failed.get(id);
    if (id === liveId) {
      return {id, label: meta?.label ?? id, url: run.currentUrl ?? page?.url ?? meta?.url ?? '', title: page?.title, state: 'live'};
    }
    if (page) {
      return {id, label: meta?.label ?? id, url: page.url, title: page.title, state: 'captured'};
    }
    if (fail) {
      return {id, label: meta?.label ?? id, url: meta?.url ?? '', state: 'blocked', detail: coverageSite(id)?.solution ?? fail.detail};
    }
    return {id, label: meta?.label ?? id, url: meta?.url ?? '', state: 'waiting', detail: coverageSite(id)?.solution ?? 'Queued for this run.'};
  });
}

function citationGroups(answer: AnswerBundle) {
  const groups = new Map<string, {title: string; url: string; quotes: Evidence[]}>();
  for (const item of answer.evidence) {
    const source = answer.sources.find((page) => page.id === item.snapshotId);
    const url = source?.url ?? item.authority;
    const current = groups.get(url) ?? {
      title: source?.title ?? item.authority,
      url,
      quotes: [],
    };
    if (current.quotes.length < 2) current.quotes.push(item);
    groups.set(url, current);
    if (groups.size >= 3 && current.quotes.length >= 2) {
      /* keep gathering only for existing groups */
    }
  }
  return [...groups.values()].slice(0, 3);
}

function formatDateValue(value: AnswerBundle['keyDates'][number]['value']): string {
  if (value.precision === 'instant') return `${value.iso} (${value.timezone})`;
  if (value.precision === 'date') return value.timezone ? `${value.date} (${value.timezone})` : value.date;
  return value.raw;
}

function evidenceIndex(answer: AnswerBundle, id: string): number {
  return answer.evidence.findIndex((item) => item.id === id);
}

function Cite({answer, id, onCite}: {answer: AnswerBundle; id: string; onCite: (id: string) => void}) {
  const n = evidenceIndex(answer, id);
  if (n < 0) return null;
  return (
    <button className="citation" aria-label={`View citation ${n + 1}`} onClick={() => onCite(id)}>
      {n + 1}
    </button>
  );
}

function AnswerView({
  answer,
  question,
  onCite,
  citationsOpen,
  expanded,
  onToggleCitations,
}: {
  answer: AnswerBundle;
  question: string;
  onCite: (id: string) => void;
  citationsOpen: boolean;
  expanded: string | null;
  onToggleCitations: (open: boolean) => void;
}) {
  const facts = compactFacts(answer);
  const pages = [...new Set(answer.sources.map((source) => source.url))];
  const missingDue = classifyQuestion(question) === 'assignment' && !facts.some((fact) => fact.field === 'deadline');
  const unknown = missingDue
    ? 'Assignment due dates are not on the public calendar, Reddit thread, or Piazza login wall we opened.'
    : answer.unknowns[0];
  const lead = clip(
    missingDue
      ? unknown
      : facts[0]?.text ?? answer.summary[0]?.text ?? 'Live pages were read. Open citations for the original wording.',
    180,
  );
  const groups = citationGroups(answer);
  return (
    <div className="answer answer-card">
      <p className="answer-lead">{lead}</p>
      <ul className="fact-list">
        {facts.slice(1).map((fact) => (
          <li key={fact.id}>
            <b>{FIELD_LABEL[fact.field] ?? fact.field}</b>
            <span>{clip(fact.text)}</span>
            {fact.evidenceIds.slice(0, 1).map((id) => (
              <Cite key={id} answer={answer} id={id} onCite={onCite} />
            ))}
          </li>
        ))}
      </ul>
      {answer.keyDates[0] && facts[0]?.field !== 'event_date' && facts[0]?.field !== 'deadline' && (
        <p className="fact-date">
          <b>{answer.keyDates[0].label}</b> {formatDateValue(answer.keyDates[0].value)}
        </p>
      )}
      {unknown && !missingDue && (
        <p className="unknowns">Not on these pages: {clip(unknown, 140)}</p>
      )}
      {answer.communityNotes[0] && (
        <p className="community-note">Reddit / student note: {clip(answer.communityNotes[0].text, 160)}</p>
      )}
      <p className="answer-foot">
        <Check size={12} />
        {pages.length} page{pages.length === 1 ? '' : 's'} · {answer.evidence.length} quote{answer.evidence.length === 1 ? '' : 's'}
      </p>
      {groups.length > 0 && (
        <details
          className="citations-box"
          open={citationsOpen}
          onToggle={(event) => onToggleCitations((event.target as HTMLDetailsElement).open)}
        >
          <summary>Citations · {groups.length} page{groups.length === 1 ? '' : 's'}</summary>
          {groups.map((group) => (
            <article key={group.url} className="citation-group">
              <strong>{group.title}</strong>
              <small>{group.url}</small>
              {group.quotes.map((item) => (
                <blockquote key={item.id} id={`source-${item.id}`} className={expanded === item.id ? 'selected' : ''}>
                  {clip(item.quote, 220)}
                </blockquote>
              ))}
            </article>
          ))}
        </details>
      )}
    </div>
  );
}

function connectionLabel(run: LiveRun | null): {text: string; online: boolean} {
  if (!run) return {text: 'Waiting', online: false};
  if (run.viewerUrl && !run.viewerClosed) return {text: 'Online', online: true};
  if (run.viewerClosed) return {text: `Viewer ${run.viewerReason ?? 'closed'}`, online: false};
  if (!isTerminal(run.status)) return {text: 'Connecting', online: false};
  return {text: 'Viewer unavailable', online: false};
}

function Workspace({features = [], onBack, onLogout}: {features: string[]; onBack: () => void; onLogout: () => void}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(readHistory);
  const [prefs, setPrefs] = useState(readPreferences);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [liveScroll, setLiveScroll] = useState(true);
  const [deleted, setDeleted] = useState<HistoryItem | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [clarifyText, setClarifyText] = useState('');
  const [archPhase, setArchPhase] = useState<SearchPhase>('detect');
  const feed = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const settingsBox = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);

  const persist = (item: LiveRun) => {
    setHistory((rows) =>
      [
        {id: item.id, question: item.question, status: item.status, mode: item.mode, createdAt: item.createdAt},
        ...rows.filter((row) => row.id !== item.id),
      ].slice(0, 40),
    );
  };

  const live = useLiveRun(persist);
  const run = live.run;
  const active = !!run && !isTerminal(run.status);
  const connection = connectionLabel(run);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [history]);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
    } catch {
      setStorageError(true);
    }
  }, [prefs]);
  useEffect(() => {
    if (run && run.id !== 'detecting') persist(run);
  }, [run?.id, run?.status]);

  useEffect(() => {
    if (!run) {
      setArchPhase('detect');
      return;
    }
    const next = searchPhase(run.status, run.capturedPages.length, Boolean(run.currentUrl));
    if (run.status === 'planning' || run.status === 'queued') {
      setArchPhase('detect');
      const timer = window.setTimeout(() => setArchPhase('split'), 420);
      return () => window.clearTimeout(timer);
    }
    setArchPhase(next);
  }, [run?.id, run?.status, run?.capturedPages.length, run?.currentUrl]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
      if (e.key === 'Tab') {
        const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input');
        if (!nodes?.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!dialog.current?.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>('input')?.focus());
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      historyButton.current?.focus();
    };
  }, [drawer]);

  useEffect(() => {
    if (!settings) return;
    const close = (e: PointerEvent) => {
      if (!settingsBox.current?.contains(e.target as Node) && !settingsButton.current?.contains(e.target as Node)) {
        setSettings(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettings(false);
        settingsButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [settings]);

  const smooth = (): ScrollBehavior =>
    prefs.motion === 'none' || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  useEffect(() => {
    if (liveScroll && activityOpen && feed.current) {
      feed.current.scrollTo({top: feed.current.scrollHeight, behavior: smooth()});
    }
  }, [run?.activities.length, activityOpen, liveScroll]);

  const start = async (question: string) => {
    if (!question.trim() || (active && run?.status === 'cancelling')) return;
    setInput('');
    setExpanded(null);
    setCitationsOpen(false);
    setActivityOpen(true);
    setLiveScroll(true);
    setDrawer(false);
    setClarifyText('');
    chat.current?.scrollTo({top: 0});
    await live.start(question);
  };

  const reset = async () => {
    if (active) await live.cancel();
    live.reset();
    setInput('');
    setExpanded(null);
    setCitationsOpen(false);
    setDrawer(false);
    setAbout(false);
    setClarifyText('');
  };

  const cite = (id: string) => {
    setExpanded(id);
    setCitationsOpen(true);
    requestAnimationFrame(() => document.getElementById(`source-${id}`)?.scrollIntoView({behavior: smooth(), block: 'nearest'}));
  };

  const restore = async (item: HistoryItem) => {
    if (active) await live.cancel();
    setInput('');
    setExpanded(null);
    setCitationsOpen(false);
    setDrawer(false);
    setActivityOpen(false);
    await live.restore(item);
    requestAnimationFrame(() => chat.current?.scrollTo({top: 0}));
  };

  const remove = (item: HistoryItem) => {
    if (item.id === run?.id) {
      void reset();
    }
    setHistory((rows) => rows.filter((row) => row.id !== item.id));
    setDeleted(item);
  };

  const changePreferences = (change: Partial<Preferences>) => setPrefs((p) => ({...p, ...change}));
  const filtered = history.filter((item) => item.question.toLowerCase().includes(search.toLowerCase()));
  const latestUrl = run?.activities.slice().reverse().find((item) => item.url)?.url;
  const blueprint = run ? detectSearch(run.question) : null;
  const panes = run ? sitePanes(run) : [];
  const pipelineSites = blueprint
    ? blueprint.sourceIds.map((id) => SOURCE_META[id]?.label ?? id)
    : [];
  const statusText = run ? statusLabel(run.status) : 'Ready';
  const progress = ((SEARCH_PHASES.findIndex((step) => step.id === archPhase) + 1) / SEARCH_PHASES.length) * 100;

  return (
    <div className={`app motion-${prefs.motion}`}>
      <div className="landscape" aria-hidden="true" />
      <div className="background-wordmark" aria-hidden="true">ALLABOUT CAMPUS</div>
      <header className="app-header">
        <button className="brand brand-button" aria-label="Return to sign in" onClick={onLogout}>
          <span className="logo">a.</span>
          <strong>AllAbout <span>Campus</span></strong>
        </button>
        <div className="header-actions">
          <button className="tools-back" onClick={onBack}><LayoutGrid size={16} />My tools</button>
          <span className="term">U of T · Fall 2026</span>
          <span className="mode-chip" aria-label="Run mode">{run?.mode ?? 'LIVE_WEB'}</span>
          <button
            className={`history-trigger ${drawer ? 'is-active' : ''}`}
            ref={historyButton}
            aria-expanded={drawer}
            onClick={() => { setDrawer(true); setSearch(''); setSettings(false); }}
          >
            <History size={16} />History{history.length > 0 && <span className="count">{history.length}</span>}
          </button>
          <div className="settings-anchor">
            <button ref={settingsButton} className="icon-button" aria-label="Motion settings" aria-expanded={settings} onClick={() => setSettings(!settings)}>
              <SlidersHorizontal size={17} />
            </button>
            {settings && (
              <div className="settings-popover" ref={settingsBox}>
                <div className="popover-heading">Make yourself comfortable</div>
                <span className="setting-label">Page transitions <b>Active immediately</b></span>
                <div className="segmented" role="group" aria-label="Page transitions">
                  {(['slide', 'page', 'none'] as const).map((m) => (
                    <button key={m} aria-pressed={prefs.motion === m} onClick={() => changePreferences({motion: m})}>
                      {m === 'page' ? 'Page turn' : m === 'slide' ? 'Slide' : 'Off'}
                    </button>
                  ))}
                </div>
                <p>Live Steel pages stay read-only. Motion only affects this desk.</p>
              </div>
            )}
          </div>
          <button className="demo-badge" aria-expanded={about} onClick={() => setAbout(!about)}><i />Live</button>
        </div>
      </header>
      {about && (
        <div className="about">
          <span>This desk asks the real backend. The right pane shows Steel’s read-only live browser when C connects.</span>
          <button aria-label="Close note" onClick={() => setAbout(false)}><X size={15} /></button>
        </div>
      )}
      <main className="workspace">
        <section className="chat-panel">
          <div className="panel-header">
            <span><MessageSquare size={16} />Chat / Task</span>
            <button className="icon-button" aria-label="New task" onClick={() => void reset()}><Plus size={18} /></button>
          </div>
          <div className="chat-body" ref={chat}>
            {!run ? (
              <div className="welcome">
                <span className="welcome-icon"><BookOpen size={22} /></span>
                <h1>One less thing to figure out.</h1>
                <p>Course, exam, assignment, or event.<br />Every question first detects the sites, then splits the browser.</p>
                {features.length > 0 && (
                  <div className="active-services">
                    <span>Your campus setup</span>
                    <div>{features.map((f) => <b key={f}>{f}</b>)}</div>
                  </div>
                )}
                {live.transportError && <p className="transport-error">{live.transportError}</p>}
                {live.executionUnavailable && <p className="transport-error">The server is up, but live execution is not configured.</p>}
                <div className="starters">
                  {starterQuestions.map((item, i) => (
                    <button className="starter" key={item.question} style={{animationDelay: `${i * 70}ms`}} onClick={() => void start(item.question)}>
                      {item.label}<ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
                <small>Detect sites → split panes → gather → answer</small>
              </div>
            ) : (
              <div key={run.id} className="conversation">
                <div className="user-question">{run.question}</div>
                <div className="answer-label"><span className="small-logo">a.</span>AllAbout Campus</div>
                <section className={`research ${active ? 'is-running' : ''}`}>
                  <button className="section-toggle" onClick={() => setActivityOpen(!activityOpen)} aria-expanded={activityOpen}>
                    <span>
                      {active ? <LoaderCircle size={15} className="spin" /> : run.status === 'cancelled' ? <Square size={13} /> : <Check size={15} />}
                      <span>{statusText}</span>
                    </span>
                    <ChevronDown size={15} className={activityOpen ? 'rotated' : ''} />
                  </button>
                  <div className="research-subline">
                    <span>{run.mode} · {blueprint?.sourceIds.length ?? 0} site{(blueprint?.sourceIds.length ?? 0) === 1 ? '' : 's'}</span>
                    {active && <span>{archPhase}</span>}
                  </div>
                  <ol className="arch-rail" data-phase={archPhase} aria-label="Search architecture">
                    {SEARCH_PHASES.map((step, index) => {
                      const current = SEARCH_PHASES.findIndex((item) => item.id === archPhase);
                      const state = index < current ? 'done' : index === current ? 'current' : 'todo';
                      return (
                        <li key={step.id} className={`is-${state}`}>
                          <b>{index + 1}</b>
                          <span>{step.label(blueprint?.sourceIds.length ?? panes.length, blueprint?.kind ?? 'general')}</span>
                        </li>
                      );
                    })}
                  </ol>
                  {pipelineSites.length > 0 && (
                    <div className="site-row">
                      {pipelineSites.map((site) => (
                        <span className="source-chip" key={site}><Globe size={10} />{site}</span>
                      ))}
                    </div>
                  )}
                  {blueprint && (
                    <ul className="coverage-board" aria-label="Site coverage">
                      {coverageForKind(blueprint.kind, blueprint.course).map((site) => {
                        const opened = blueprint.sourceIds.includes(site.id);
                        const pane = panes.find((item) => item.id === site.id);
                        const state = !opened ? site.access : pane?.state ?? site.access;
                        return (
                          <li key={site.id} className={`is-${state}`}>
                            <b>{site.label}</b>
                            <small>{opened ? (pane?.state === 'blocked' ? site.solution : site.covers) : site.solution}</small>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="progress-track"><span style={{width: `${progress}%`}} /></div>
                  <div className={`activity-collapse ${activityOpen ? 'open' : ''}`}>
                    <div className="activity-collapse-inner">
                      <div className="activity-feed" ref={feed} onWheel={() => setLiveScroll(false)} tabIndex={0} aria-label="Research activity">
                        <ol>
                          {run.activities.map((item, i) => (
                            <li key={`${run.id}-${item.seq}`} className={`activity-item ${i === run.activities.length - 1 && active ? 'current' : ''}`}>
                              <span className="activity-icon">
                                {i === run.activities.length - 1 && active ? <LoaderCircle size={13} className="spin" /> : item.kind === 'failed' ? <X size={13} /> : <Check size={13} />}
                              </span>
                              <div>
                                <span>{item.title}</span>
                                {item.url ? (
                                  <span className="source-chip"><Globe size={10} />{pageChip(item.url) ?? item.url}</span>
                                ) : item.detail ? (
                                  <small>{item.detail}</small>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {!liveScroll && active && (
                        <button className="follow-activity" onClick={() => setLiveScroll(true)}>Follow activity</button>
                      )}
                    </div>
                  </div>
                </section>
                {live.transportError && <p className="transport-error">{live.transportError}</p>}
                {run.clarification && (
                  <form className="clarify-box" onSubmit={(e) => { e.preventDefault(); void live.clarify(clarifyText); setClarifyText(''); }}>
                    <p>{run.clarification.question}</p>
                    <input value={clarifyText} onChange={(e) => setClarifyText(e.target.value)} placeholder="Add the missing detail" />
                    <button type="submit" className="retry" disabled={!clarifyText.trim()}>Send clarification</button>
                  </form>
                )}
                {active && !run.answer && (
                  <p className="working" role="status">
                    <span className="typing"><i /><i /><i /></span>
                    {statusText}
                  </p>
                )}
                {run.error && (
                  <div className="answer">
                    <p>{run.error.message}</p>
                    <button className="retry" onClick={() => void start(run.question)}><RotateCcw size={14} />Try again</button>
                  </div>
                )}
                {run.status === 'cancelled' && !run.answer && (
                  <div className="answer">
                    <p>Stopped here. Pick it up whenever you’re ready.</p>
                    <button className="retry" onClick={() => void start(run.question)}><RotateCcw size={14} />Try again</button>
                  </div>
                )}
                {run.answer && (
                  <AnswerView
                    answer={run.answer}
                    question={run.question}
                    onCite={cite}
                    citationsOpen={citationsOpen}
                    expanded={expanded}
                    onToggleCitations={setCitationsOpen}
                  />
                )}
              </div>
            )}
          </div>
          <div className="composer-wrap">
            <form onSubmit={(e) => { e.preventDefault(); void start(input); }}>
              <textarea
                maxLength={2000}
                aria-label="Ask a question"
                placeholder="Ask a course, exam, assignment, or event…"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void start(input);
                  }
                }}
              />
              <div>
                <span>CSC207H1 <span>·</span> LIVE_WEB</span>
                {active ? (
                  <button className="send" type="button" aria-label="Stop task" onClick={() => void live.cancel()}><Square size={14} /></button>
                ) : (
                  <button className="send" disabled={!input.trim()} aria-label="Send question"><ArrowUp size={18} /></button>
                )}
              </div>
            </form>
            <p>Live pages only. Cited facts stay short; missing facts stay unknown.</p>
          </div>
        </section>
        <section className="browser-panel">
          <div className="panel-header">
            <span><Monitor size={16} />Steel Live Browser</span>
            <small className={`connection ${connection.online ? 'is-online' : ''}`}><i />{connection.text}</small>
          </div>
          <div className="browser-toolbar">
            <span className="browser-dots"><i /><i /><i /></span>
            <div className="address">
              <Globe size={13} />
              <span>{latestUrl ? new URL(latestUrl).host : run?.viewerUrl ? 'steel.dev live session' : 'Waiting for a task'}</span>
            </div>
            <small>{run?.mode ?? 'LIVE'}</small>
          </div>
          <div className={`browser-stage ${run ? 'has-live is-split' : ''}`}>
            {run ? (
              <div className="split-screen" data-count={Math.max(panes.length, 1)}>
                {panes.map((pane) => {
                  const liveHere = pane.state === 'live' && run.viewerUrl && !run.viewerClosed;
                  const quote = run.answer?.sources.some((source) => source.sourceId === pane.id)
                    ? run.answer.evidence.find((item) => run.answer?.sources.some((source) => source.id === item.snapshotId && source.sourceId === pane.id))?.quote
                    : undefined;
                  return (
                    <section className={`split-pane is-${pane.state}`} key={pane.id}>
                      <div className="split-chrome">
                        <span className="browser-dots"><i /><i /><i /></span>
                        <strong>{pane.label}</strong>
                        <small>{pane.state}</small>
                      </div>
                      <div className="split-address">{pane.url || 'Waiting'}</div>
                      <div className="split-body">
                        {liveHere ? (
                          <iframe
                            src={run.viewerUrl ?? undefined}
                            title={`${pane.label} live`}
                            sandbox="allow-scripts allow-same-origin"
                            referrerPolicy="no-referrer"
                            tabIndex={-1}
                          />
                        ) : pane.state === 'captured' && pane.url ? (
                          <iframe
                            src={pane.url}
                            title={pane.title ?? pane.label}
                            sandbox="allow-scripts allow-same-origin"
                            referrerPolicy="no-referrer"
                            tabIndex={-1}
                          />
                        ) : (
                          <div className="split-fallback">
                            <b>{pane.title ?? pane.label}</b>
                            <p>{pane.detail ?? (pane.state === 'waiting' ? 'Opening this site next.' : 'This site blocked the live reader or requires login.')}</p>
                          </div>
                        )}
                        {quote && <blockquote>{clip(quote, 140)}</blockquote>}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="browser-empty">
                <div className="window-symbol">
                  <div><i /><i /><i /></div>
                  <span /><span /><span />
                </div>
                <h2>Watch three sites at once.</h2>
                <p>A course or assignment run opens calendar, Reddit, and Piazza in split panes. Blocked sites stay visible as a login or policy wall.</p>
                <small>calendar · reddit · piazza</small>
              </div>
            )}
          </div>
          <div className="page-controls">
            <div className="page-status">
              {active ? <LoaderCircle size={13} className="spin" /> : <Globe size={13} />}
              <span>{active ? statusText : run?.answer ? 'Live sources reviewed' : 'Your sources will appear here'}</span>
            </div>
          </div>
          <div className="browser-footer">
            <span>{run?.viewerUrl ? (run.viewerClosed ? 'Viewer frozen after cleanup' : 'Read-only Steel session') : 'Waiting for viewer_ready'}</span>
            <span>Live browsing</span>
          </div>
        </section>
      </main>
      <footer className="app-footer">
        <span>ALLABOUT CAMPUS</span>
        <span>Made for the questions between classes.</span>
      </footer>
      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)}>
          <aside ref={dialog} className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-heading" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-heading">
              <div><History size={18} /><h2 id="history-heading">Your history</h2></div>
              <button className="icon-button" aria-label="Close history" onClick={() => setDrawer(false)}><X size={18} /></button>
            </div>
            <p className="history-description">Opening a past item restores the saved result. It does not start a new Steel session.</p>
            <label className="history-search">
              <Search size={16} />
              <input aria-label="Search history" placeholder="Find a past question…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button aria-label="Clear history search" onClick={() => setSearch('')}><X size={13} /></button>}
            </label>
            <div className="history-list">
              {filtered.length === 0 ? (
                <div className="history-empty">
                  <MessageSquare size={25} />
                  <h3>{search ? 'No matching questions.' : 'Nothing here just yet.'}</h3>
                  <p>{search ? 'Try a different word.' : 'Your inquiries will be saved here on this browser.'}</p>
                </div>
              ) : filtered.map((item) => (
                <div className={`history-item ${item.id === run?.id ? 'current' : ''}`} key={item.id}>
                  <button className="history-open" onClick={() => void restore(item)}>
                    <MessageSquare size={15} />
                    <span>
                      {item.question}
                      <small>
                        {new Date(item.createdAt).toLocaleDateString('en-CA', {month: 'short', day: 'numeric'})} · {new Date(item.createdAt).toLocaleTimeString('en-CA', {hour: '2-digit', minute: '2-digit'})}
                        <span>{item.mode} · {item.status}</span>
                      </small>
                    </span>
                  </button>
                  <button className="delete-history" aria-label={`Delete inquiry: ${item.question}`} onClick={() => remove(item)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="history-bottom">
              <span>{storageError ? 'Storage unavailable — kept for this session only.' : 'Saved on this browser · up to 40 inquiries'}</span>
              <small>History never pretends to replay Steel.</small>
            </div>
          </aside>
        </div>
      )}
      {deleted && (
        <div className="toast" role="status">
          <span>Inquiry removed</span>
          <button onClick={() => { setHistory((h) => [deleted, ...h.filter((r) => r.id !== deleted.id)].slice(0, 40)); setDeleted(null); }}>Undo</button>
          <button aria-label="Dismiss notification" onClick={() => setDeleted(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

const setupCards = [
  {id: 'Course desk', title: 'Course desk', copy: 'Ask clear questions and keep the original course page beside the answer.', icon: MessageSquare, tag: 'CORE'},
  {id: 'Timetable', title: 'Timetable & class alerts', copy: 'Upload a timetable or add classes later. Get a reminder before your next class.', icon: CalendarDays, tag: 'SCHEDULE'},
  {id: 'Assessments', title: 'Study & assessment plan', copy: 'Track exercises, midterms, tests, final exams, and assignment milestones.', icon: GraduationCap, tag: 'STUDY'},
  {id: 'Notices', title: 'Important notices', copy: 'Flag deadline changes, room updates, and messages that need your attention.', icon: BellRing, tag: 'ALERTS'},
];

function CampusSetup({onContinue, onLogout}: {onContinue: (features: string[]) => void; onLogout: () => void}) {
  const [selected, setSelected] = useState<string[]>(['Course desk', 'Timetable', 'Assessments']);
  const [file, setFile] = useState('');
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="setup-shell">
      <header className="setup-header">
        <button className="auth-brand brand-button" aria-label="Return to sign in" onClick={onLogout}>
          <span className="logo">a.</span>
          <strong>AllAbout <span>Campus</span></strong>
        </button>
        <span>SET UP YOUR SPACE · 2 OF 2</span>
      </header>
      <main className="setup-main">
        <div className="setup-intro">
          <span className="auth-kicker">BUILD YOUR SEMESTER</span>
          <h1>Choose your campus tools.</h1>
          <p>You can come back and change these anytime.</p>
        </div>
        <section className="setup-grid">
          {setupCards.map((card, index) => {
            const Icon = card.icon;
            const active = selected.includes(card.id);
            return (
              <button type="button" className={`setup-card tone-${index} ${active ? 'selected' : ''}`} key={card.id} aria-pressed={active} onClick={() => toggle(card.id)}>
                <span className="setup-tag">{card.tag}</span>
                <span className="setup-icon"><Icon size={22} /></span>
                <strong>{card.title}</strong>
                <p>{card.copy}</p>
                <span className="select-indicator">{active ? <Check size={15} /> : <Plus size={15} />}</span>
              </button>
            );
          })}
        </section>
        <section className="timetable-upload">
          <div>
            <Upload size={19} />
            <span>
              <b>Have a timetable file?</b>
              <small>{file ? `Ready to import: ${file}` : 'PDF, screenshot, or calendar export'}</small>
            </span>
          </div>
          <label className="upload-control">
            {file ? 'Replace file' : 'Choose file'}
            <input type="file" accept=".pdf,image/*,.ics" onChange={(e) => setFile(e.target.files?.[0]?.name || '')} />
          </label>
        </section>
        <div className="setup-bottom">
          <span><AlarmClock size={15} />Class alerts default to 20 minutes before start.</span>
          <button className="primary-auth" onClick={() => onContinue(selected)}>Open my campus desk <ArrowRight size={17} /></button>
        </div>
      </main>
    </div>
  );
}

type AuthMode = 'login' | 'create' | 'verify' | 'forgot';

function AuthGate() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [features, setFeatures] = useState<string[] | null>(null);
  const [notice, setNotice] = useState('');
  const enter = () => {
    setEntering(true);
    setTimeout(() => {
      setEntering(false);
      setAuthenticated(true);
    }, 1250);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create' || mode === 'forgot') {
      setMode('verify');
      setNotice(`A six-digit code was sent to your ${method === 'email' ? 'email address' : 'phone number'}.`);
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      enter();
    }, 650);
  };
  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      enter();
    }, 650);
  };
  const logOut = () => {
    setAuthenticated(false);
    setFeatures(null);
    setMode('login');
  };
  if (authenticated && features) return <Workspace features={features} onBack={() => setFeatures(null)} onLogout={logOut} />;
  if (authenticated) return <CampusSetup onContinue={setFeatures} onLogout={logOut} />;
  if (entering) {
    return (
      <div className="launch-screen" aria-label="Entering AllAbout Campus">
        <div className="launch-orbit" />
        <div className="launch-logo">a.</div>
        <p>AllAbout <b>Campus</b></p>
        <span>Finding your campus, one page at a time.</span>
      </div>
    );
  }
  const isVerify = mode === 'verify';
  const isForgot = mode === 'forgot';
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div className="auth-brand"><span className="logo">a.</span><strong>AllAbout <span>Campus</span></strong></div>
        <div className="auth-copy">
          <span className="auth-kicker">YOUR CAMPUS, CLEARER</span>
          <h1>Campus answers.<br />Without the hunt.</h1>
          <p>Courses, deadlines, and sources—all in one place.</p>
        </div>
        <div className="auth-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      </aside>
      <main className="auth-main">
        <div className="auth-top"><span>ALLABOUT CAMPUS</span></div>
        <section className="auth-card">
          <h2>{isVerify ? 'Check your inbox' : isForgot ? 'Reset password' : mode === 'create' ? 'Create account' : 'Welcome back'}</h2>
          <p>
            {isVerify
              ? notice
              : isForgot
                ? 'We’ll send you a verification code.'
                : mode === 'create'
                  ? 'Choose email or phone to get started.'
                  : 'Sign in to open your campus desk.'}
          </p>
          {isVerify ? (
            <form onSubmit={verify}>
              <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="• • • • • •" /></label>
              <button className="primary-auth" disabled={loading}>{loading ? 'Verifying…' : 'Verify and continue'}<ArrowRight size={17} /></button>
              <button type="button" className="text-auth" onClick={() => setNotice(`A new code was sent to your ${method === 'email' ? 'email address' : 'phone number'}.`)}>Send a new code</button>
            </form>
          ) : (
            <form onSubmit={submit}>
              {(mode === 'create' || isForgot) && (
                <div className="method-switch">
                  <button type="button" className={method === 'email' ? 'selected' : ''} onClick={() => setMethod('email')}><Mail size={15} />Email</button>
                  <button type="button" className={method === 'phone' ? 'selected' : ''} onClick={() => setMethod('phone')}><Smartphone size={15} />Phone</button>
                </div>
              )}
              <label>
                {isForgot ? 'Email or phone' : mode === 'create' ? (method === 'email' ? 'Email address' : 'Phone number') : 'Username or email'}
                <input required type={method === 'email' || mode === 'login' ? 'email' : 'tel'} autoComplete="username" placeholder={method === 'phone' ? '+1 416 555 0123' : 'you@utoronto.ca'} />
              </label>
              {!isForgot && (
                <label>
                  Password
                  <div className="password-wrap">
                    <input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" />
                    <button type="button" aria-label="Show password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  </div>
                </label>
              )}
              {mode === 'login' && <button type="button" className="forgot" onClick={() => setMode('forgot')}>Forgot password?</button>}
              <button className="primary-auth" disabled={loading}>
                {loading ? 'Just a moment…' : isForgot ? 'Send verification code' : mode === 'create' ? 'Create account' : 'Sign in'}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {mode === 'login' && <p className="auth-foot">New here? <button onClick={() => setMode('create')}>Create an account</button></p>}
          {mode === 'create' && <p className="auth-foot">Already registered? <button onClick={() => setMode('login')}>Sign in</button></p>}
          <small className="auth-privacy">Demo account flow · no personal data is sent</small>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthGate /></React.StrictMode>);
