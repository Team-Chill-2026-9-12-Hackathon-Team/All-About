import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  ArrowRight, ArrowUp, ArrowUpRight, BellRing, BookOpen, CalendarDays, Check, ChevronDown,
  Eye, EyeOff, Globe, History, KeyRound, LoaderCircle, Mail, MessageSquare, Monitor, Smartphone,
  Plus, RotateCcw, Search, SlidersHorizontal, Square, Trash2, X,
} from 'lucide-react';
import {HISTORY_KEY, SETTINGS_KEY, readHistory, readPreferences, type HistoryItem, type Preferences} from './history';
import {
  classifyQuestion, detectSearch, hostOf, isTerminal, presentationState, SOURCE_META, statusLabel, useLiveRun,
  type AnswerBundle, type Evidence, type LiveRun,
} from './live';
import { coverageSite } from './coverage-catalog.ts';
import { SEARCH_PHASES, searchPhase, type SearchPhase } from './search-architecture.ts';
import { VaultDrawer } from './VaultDrawer';
import './desk.css';

const starterQuestions = [
  {label: 'Live · CSC207 prerequisites', question: 'What are the prerequisites for CSC207H1?'},
  {label: 'Live · CS Specialist requirements', question: 'What are the graduation requirements for the U of T Computer Science Specialist?'},
  {label: 'Live · Carillon date, place, access', question: 'When and where is the Labour Day Carillon Recital, and is it free?'},
  {label: 'Live · Carillon and Soldiers’ Tower', question: "When is the Labour Day Carillon Recital and what is the Soldiers' Tower carillon?"},
];

const FIELD_LABEL: Record<string, string> = {
  requirements: 'Requirement',
  eligibility: 'Who it applies to',
  event_date: 'Date',
  event_time: 'Time',
  location: 'Location',
  organizer: 'Organizer',
  event_description: 'What it is',
  registration_link: 'Registration',
  community_note: 'Student note',
};

const TOPIC_LABEL = {
  course: 'Course check',
  event: 'Event check',
  exam: 'Exam check',
  program: 'Program check',
  general: 'Campus check',
} as const;

function followUpsFor(question: string): string[] {
  switch (classifyQuestion(question)) {
    case 'course':
      return ['Does this apply to my record?', 'What should I check before enrolling?'];
    case 'event':
      return ['Do I need to register?', 'What should I know before I go?'];
    case 'exam':
      return ['What is my next deadline?', 'What should I do if I have a conflict?'];
    case 'program':
      return ['Which requirement should I check next?', 'What applies to my year of study?'];
    default:
      return ['What is the next official step?', 'What has not been confirmed?'];
  }
}

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
    ['event_date', 'requirements', 'location', 'eligibility', 'event_time', 'organizer', 'event_description'].indexOf(field);
  const sorted = [...claims].sort((a, b) => {
    const left = rank(a.field);
    const right = rank(b.field);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
  });
  for (const claim of sorted) {
    if (claim.status === 'unknown' || claim.status === 'superseded' || claim.status === 'conflict' || claim.field === 'community_note') continue;
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

function isSteelViewerUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'steel.dev' || host.endsWith('.steel.dev');
  } catch {
    return false;
  }
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

function HighlightText({text}: {text: string}) {
  const pattern = /(\b[A-Z]{2,4}\d{3}(?:[HY]\d)?\b|\b\d+(?:\.\d+)?\s*(?:%|credits?)\b|\b(?:UTSG|CMP1|ASIP)\b)/g;
  const parts = text.split(pattern);
  const isKeyword = /^(?:[A-Z]{2,4}\d{3}(?:[HY]\d)?|\d+(?:\.\d+)?\s*(?:%|credits?)|UTSG|CMP1|ASIP)$/;
  return <>{parts.map((part, index) => isKeyword.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part)}</>;
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
  for (const source of run.answer?.sources ?? []) {
    if (!captured.has(source.sourceId)) {
      captured.set(source.sourceId, {title: source.title, url: source.url, sourceId: source.sourceId});
    }
  }
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

function sourceName(answer: AnswerBundle, evidenceId: string): string {
  const evidence = answer.evidence.find((item) => item.id === evidenceId);
  const source = answer.sources.find((item) => item.id === evidence?.snapshotId);
  return (source?.sourceId && SOURCE_META[source.sourceId]?.label) ?? source?.title ?? evidence?.authority ?? 'Official source';
}

function AnswerView({
  answer,
  question,
  onCite,
  onFollowUp,
  citationsOpen,
  expanded,
  onToggleCitations,
}: {
  answer: AnswerBundle;
  question: string;
  onCite: (id: string) => void;
  onFollowUp: (question: string) => void;
  citationsOpen: boolean;
  expanded: string | null;
  onToggleCitations: (open: boolean) => void;
}) {
  const facts = compactFacts(answer);
  const pages = [...new Set(answer.sources.map((source) => source.url))];
  const gaps = answer.unknowns.slice(0, 2);
  const kind = classifyQuestion(question);
  const lead = clip(
    facts[0]?.text ?? answer.summary[0]?.text ?? 'Source receipts are available. Open citations for the original wording.',
    180,
  );
  const groups = citationGroups(answer);
  const primaryEvidence = answer.evidence.find((item) => item.id === facts[0]?.evidenceIds[0]) ?? answer.evidence[0];
  const followUps = followUpsFor(question);
  return (
    <div className="answer answer-card">
      <div className="answer-hero-head">
        <span>{TOPIC_LABEL[kind]}</span>
        <b className={gaps.length > 0 ? 'answer-status is-partial' : 'answer-status'}>
          {gaps.length > 0 ? 'Partial' : 'Verified'}
        </b>
        <small>{answer.mode}</small>
        {primaryEvidence && <small>{primaryEvidence.authority}</small>}
      </div>
      <section className="answer-summary" aria-label="Key finding">
        <p className="answer-kicker">Key finding</p>
        <p className="answer-lead"><HighlightText text={lead} /></p>
        {facts[0]?.evidenceIds.slice(0, 1).map((id) => (
          <span key={id} className="inline-source">View original wording <Cite answer={answer} id={id} onCite={onCite} /></span>
        ))}
      </section>
      {facts.length > 1 && (
        <section className="answer-section-block" aria-label="What this means">
          <p className="answer-kicker">What this means</p>
          <ul className="fact-list">
            {facts.slice(1).map((fact) => (
          <li key={fact.id}>
            <b>{FIELD_LABEL[fact.field] ?? fact.field}</b>
            <span><HighlightText text={clip(fact.text)} /></span>
            {fact.evidenceIds.slice(0, 1).map((id) => (
              <Cite key={id} answer={answer} id={id} onCite={onCite} />
            ))}
          </li>
            ))}
          </ul>
        </section>
      )}
      {answer.keyDates[0] && facts[0]?.field !== 'event_date' && (
        <p className="fact-date">
          <b>{answer.keyDates[0].label}</b> {formatDateValue(answer.keyDates[0].value)}
        </p>
      )}
      {answer.communityNotes[0] && (
        <div className="community-note">
          <span><b>Student perspective</b> · <HighlightText text={clip(answer.communityNotes[0].text, 160)} /></span>
          {answer.communityNotes[0].evidenceIds.slice(0, 1).map((id) => (
            <Cite key={id} answer={answer} id={id} onCite={onCite} />
          ))}
        </div>
      )}
      <section className="next-steps" aria-label="Next steps">
        <p className="answer-kicker">Next step</p>
        <div className="follow-ups">
          {followUps.map((question) => <button key={question} type="button" className="starter" onClick={() => onFollowUp(question)}>{question}</button>)}
        </div>
      </section>
      <section className="evidence-map" aria-label="Evidence map">
        <div className="evidence-map-head"><p className="answer-kicker">Evidence map</p><small>{pages.length} page{pages.length === 1 ? '' : 's'} checked</small></div>
        {facts.slice(0, 4).map((fact) => {
          const evidenceId = fact.evidenceIds[0];
          return (
            <button key={fact.id} type="button" className="evidence-map-row" onClick={() => evidenceId && onCite(evidenceId)}>
              <span className="map-claim"><b>{FIELD_LABEL[fact.field] ?? 'Finding'}</b><em><HighlightText text={clip(fact.text, 78)} /></em></span>
              <ArrowRight size={14} />
              <span className="map-source">{evidenceId ? clip(sourceName(answer, evidenceId), 40) : 'No source'}</span>
            </button>
          );
        })}
      </section>
      {gaps.length > 0 && (
        <section className="answer-gaps" aria-label="Not confirmed">
          <p className="answer-kicker">Not confirmed</p>
          {gaps.map((gap) => <p key={gap}>{clip(gap, 160)}</p>)}
        </section>
      )}
      {groups.length > 0 && (
        <details
          className="citations-box"
          open={citationsOpen}
          onToggle={(event) => onToggleCitations((event.target as HTMLDetailsElement).open)}
        >
          <summary>Original wording · {groups.length} source{groups.length === 1 ? '' : 's'}</summary>
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
  if (run.executionKind === 'local_fixture') return {text: 'Local demo data', online: false};
  if (run.viewerState === 'ready') return {text: 'Online', online: true};
  if (run.viewerState === 'closed') return {text: 'Viewer released', online: false};
  if (run.viewerState === 'cleanup_failed') return {text: 'Viewer release failed', online: false};
  if (!isTerminal(run.status)) return {text: 'Connecting', online: false};
  return {text: 'Viewer unavailable', online: false};
}

function viewerDetail(run: LiveRun | null): string {
  if (!run) return 'Waiting for a task';
  if (run.executionKind === 'local_fixture') return 'No viewer · local fixture';
  if (run.viewerState === 'ready') return 'Read-only Steel session';
  if (run.viewerState === 'closed') return 'Viewer closed after cleanup';
  if (run.viewerState === 'cleanup_failed') return 'Viewer release failed · manual cleanup required';
  return 'Viewer not created';
}

function EvidenceWorkspace({run, selectedEvidenceId}: {run: LiveRun; selectedEvidenceId: string | null}) {
  const answer = run.answer;
  if (!answer) return null;
  const selectedEvidence = answer.evidence.find((item) => item.id === selectedEvidenceId) ?? answer.evidence[0];
  const source = answer.sources.find((item) => item.id === selectedEvidence?.snapshotId) ?? answer.sources[0];
  if (!source) return null;
  const quotes = answer.evidence.filter((item) => item.snapshotId === source.id).slice(0, 4);
  return (
    <article className="evidence-workspace" aria-label="Evidence workspace">
      <div className="evidence-kicker"><span>Evidence receipt</span><b>{source.contentMode}</b></div>
      <h2>{source.title}</h2>
      <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
      <dl>
        <div><dt>Captured</dt><dd>{new Date(source.fetchedAt).toLocaleString('en-CA')}</dd></div>
        <div><dt>Source type</dt><dd>{source.kind}</dd></div>
        <div><dt>Run mode</dt><dd>{run.mode}</dd></div>
      </dl>
      <div className="evidence-quotes">
        {quotes.map((item) => (
          <blockquote key={item.id} className={item.id === selectedEvidence?.id ? 'selected' : ''}>
            <small>Quote {evidenceIndex(answer, item.id) + 1} · {item.authority}</small>
            {item.quote}
          </blockquote>
        ))}
      </div>
    </article>
  );
}

function Workspace({onReturnToLanding}: {onReturnToLanding?: () => void} = {}) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState(readHistory);
  const [prefs, setPrefs] = useState(readPreferences);
  const [drawer, setDrawer] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState(false);
  const [about, setAbout] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
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
  const presentation = presentationState(run);

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
    if (run?.answer) setActivityOpen(false);
  }, [run?.answer]);
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

  const start = async (question: string, options?: { parentRunId?: string }) => {
    if (!question.trim() || (active && run?.status === 'cancelling')) return;
    setInput('');
    setExpanded(null);
    setCitationsOpen(false);
    setActivityOpen(false);
    setLiveScroll(true);
    setDrawer(false);
    setVaultOpen(false);
    setClarifyText('');
    chat.current?.scrollTo({top: 0});
    await live.start(question, options);
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

  const returnToLanding = async () => {
    await reset();
    onReturnToLanding?.();
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
        <button className="brand brand-button" aria-label="Return to sign in" onClick={() => void returnToLanding()}>
          <span className="logo">a.</span>
          <strong>AllAbout <span>Campus</span></strong>
        </button>
        <div className="header-actions">
          <span className="term">U of T · Fall 2026</span>
          <span className="mode-chip" aria-label="Run mode">{run?.mode ?? 'READY'}</span>
          <button
            className={`history-trigger ${vaultOpen ? 'is-active' : ''}`}
            aria-label="Open password vault"
            aria-expanded={vaultOpen}
            onClick={() => {
              setVaultOpen(true);
              setDrawer(false);
              setSettings(false);
            }}
          >
            <KeyRound size={16} />Keychain
          </button>
          <button
            className={`history-trigger ${drawer ? 'is-active' : ''}`}
            ref={historyButton}
            aria-expanded={drawer}
            onClick={() => { setDrawer(true); setVaultOpen(false); setSearch(''); setSettings(false); }}
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
          <button className="demo-badge" aria-expanded={about} onClick={() => setAbout(!about)}><i />{run ? presentation.replaceAll('_', ' ') : 'How it works'}</button>
        </div>
      </header>
      {about && (
        <div className="about">
          <span>Mode and browser status come from the backend. Local demo data is labeled and never presented as a live session.</span>
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
                <p>Course, program, exam, event, or campus service.<br />Every question first selects the right official sources, then opens them.</p>
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
                {run.answer && (
                  <div className="task-receipt">
                    <b>Research ready</b>
                    <span>{run.answer.sources.length} official page{run.answer.sources.length === 1 ? '' : 's'} · {run.answer.evidence.length} linked quote{run.answer.evidence.length === 1 ? '' : 's'}</span>
                  </div>
                )}
                <section className={`research ${active ? 'is-running' : ''}`}>
                  <button className="section-toggle" onClick={() => setActivityOpen(!activityOpen)} aria-expanded={activityOpen}>
                    <span>
                      {active ? <LoaderCircle size={15} className="spin" /> : run.status === 'cancelled' ? <Square size={13} /> : <Check size={15} />}
                      <span>{statusText}</span>
                    </span>
                    <ChevronDown size={15} className={activityOpen ? 'rotated' : ''} />
                  </button>
                  <div className="research-compact">
                    <span className={`research-pulse ${active ? 'is-active' : ''}`} />
                    <span>{run.mode} · {run.answer?.sources.length ?? panes.filter((pane) => pane.state === 'captured').length}/{blueprint?.sourceIds.length ?? 0} sources</span>
                    <span className="research-metrics">{run.answer?.evidence.length ?? 0} evidence</span>
                  </div>
                  {pipelineSites.length > 0 && <div className="research-sites">{pipelineSites.slice(0, 3).map((site) => <span className="source-chip" key={site}><Globe size={10} />{site}</span>)}</div>}
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
              </div>
            )}
          </div>
          <div className={`composer-wrap ${run ? 'has-run' : ''}`}>
            <form onSubmit={(e) => { e.preventDefault(); void start(input); }}>
              <textarea
                maxLength={2000}
                aria-label="Ask a question"
                placeholder="Ask about a course, program, exam, event, or campus service…"
                rows={1}
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
                <span>{blueprint?.course ?? blueprint?.entity ?? 'Campus'} <span>·</span> {run?.mode ?? (input.toUpperCase().includes('DEMO101') ? 'LOCAL_FIXTURE' : 'LIVE_WEB')}</span>
                {active ? (
                  <button className="send" type="button" aria-label="Stop task" onClick={() => void live.cancel()}><Square size={14} /></button>
                ) : (
                  <button className="send" disabled={!input.trim()} aria-label="Send question"><ArrowUp size={18} /></button>
                )}
              </div>
            </form>
            <p>Execution mode is selected from the question and confirmed by the backend.</p>
          </div>
        </section>
        <section className="browser-panel">
          <div className="panel-header">
            <span><Monitor size={16} />{run?.answer ? 'Research result' : run?.executionKind === 'local_fixture' ? 'Local Evidence Preview' : 'Steel Browser'}</span>
            <small className={`connection ${connection.online ? 'is-online' : ''}`}><i />{connection.text}</small>
          </div>
          {!run?.answer && <div className="browser-toolbar">
            <span className="browser-dots"><i /><i /><i /></span>
            <div className="address">
              <Globe size={13} />
              <span>{latestUrl ? new URL(latestUrl).host : run?.viewerUrl ? 'steel.dev live session' : 'Waiting for a task'}</span>
            </div>
            <small>{run?.mode ?? 'IDLE'}</small>
          </div>}
          <div className={`browser-stage ${run && !run.answer ? 'has-live' : ''} ${run && isSteelViewerUrl(run.viewerUrl) && !run.viewerClosed ? 'is-projecting' : run && !run.answer ? 'is-split' : ''} ${run?.answer ? 'has-result' : ''}`}>
            {run?.answer ? (
              <div className="result-workspace">
                <AnswerView
                  answer={run.answer}
                  question={run.question}
                  onCite={cite}
                  onFollowUp={(next) => void start(next, { parentRunId: run.id })}
                  citationsOpen={citationsOpen}
                  expanded={expanded}
                  onToggleCitations={setCitationsOpen}
                />
                <EvidenceWorkspace run={run} selectedEvidenceId={expanded} />
              </div>
            ) : run ? (
              isSteelViewerUrl(run.viewerUrl) && !run.viewerClosed ? (
                <div className="live-frame" data-testid="steel-live-frame">
                  <iframe
                    src={run.viewerUrl ?? undefined}
                    title="Steel live browser"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    referrerPolicy="no-referrer"
                    tabIndex={-1}
                  />
                  <div className="gather-overlay">
                    <span className="gather-kicker">LIVE STEEL SESSION</span>
                    <strong>{panes.find((pane) => pane.state === 'live')?.label ?? 'Opening the live page'}</strong>
                    <small>{latestUrl ?? run.currentUrl ?? 'Connecting the cloud browser to the public page.'}</small>
                    <i className="gather-scan" />
                  </div>
                </div>
              ) : (
              <div className="split-screen" data-count={Math.max(panes.length, 1)}>
                {panes.map((pane) => {
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
                        <div className="split-fallback">
                          <b>{pane.title ?? pane.label}</b>
                          <p>
                            {pane.state === 'captured'
                              ? run.executionKind === 'local_fixture'
                                ? 'Captured from bundled fictional demo data. No browser session was created.'
                                : 'Captured from the browser run. Open a citation to inspect the supporting quote.'
                              : pane.detail ?? (pane.state === 'waiting' ? (run.executionKind === 'local_fixture' ? 'Reading bundled demo data.' : 'Waiting for the browser to open this source.') : 'This source could not be read or requires login.')}
                          </p>
                          {quote && <blockquote>{clip(quote, 140)}</blockquote>}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
              )
            ) : (
              <div className="browser-empty">
                <div className="window-symbol">
                  <div><i /><i /><i /></div>
                  <span /><span /><span />
                </div>
                <h2>Watch three sites at once.</h2>
                <p>Each question opens the official pages that fit it, then keeps the evidence beside the answer.</p>
                <small>calendar · registrar · student services</small>
              </div>
            )}
          </div>
          <div className="page-controls">
            <div className="page-status">
              {active ? <LoaderCircle size={13} className="spin" /> : <Globe size={13} />}
              <span>{active ? statusText : run?.answer ? `${run.answer.sources.length} source receipt${run.answer.sources.length === 1 ? '' : 's'}` : 'Your sources will appear here'}</span>
            </div>
          </div>
          <div className="browser-footer">
            <span>{viewerDetail(run)}</span>
            <span>{run?.mode ?? 'IDLE'}</span>
          </div>
        </section>
      </main>
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
      <VaultDrawer open={vaultOpen} onClose={() => setVaultOpen(false)} />
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
  {
    id: 'Courses & Requirements',
    title: 'Courses & Programs',
    copy: 'Prerequisites, offerings, and degree paths.',
    sources: ['Academic Calendar', 'CS Department'],
    icon: BookOpen,
    tag: 'COURSES',
  },
  {
    id: 'Campus Events',
    title: 'Campus Events',
    copy: 'Dates, locations, access, and registration.',
    sources: ['U of T Events', 'Student Life'],
    icon: CalendarDays,
    tag: 'EVENTS',
  },
  {
    id: 'Policies & Services',
    title: 'Policy & Support',
    copy: 'University rules and student services.',
    sources: ['U of T Registrar', 'Current Students'],
    icon: BellRing,
    tag: 'POLICIES',
  },
];

function CampusSetup({onContinue, onLogout}: {onContinue: (features: string[]) => void; onLogout: () => void}) {
  const [selected, setSelected] = useState<string[]>(['Courses & Requirements', 'Campus Events']);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="setup-shell">
      <header className="setup-header">
        <button className="auth-brand brand-button" aria-label="Return to sign in" onClick={onLogout}>
          <span className="logo">a.</span>
          <strong>AllAbout <span>Campus</span></strong>
        </button>
      </header>
      <main className="setup-main">
        <div className="setup-intro">
          <h1>Choose a campus topic</h1>
          <p>Pick what you want to look up.</p>
        </div>
        <section className="setup-grid">
          {setupCards.map((card, index) => {
            const Icon = card.icon;
            const active = selected.includes(card.id);
            return (
              <button type="button" className={`setup-card tone-${index} ${active ? 'selected' : ''}`} key={card.id} aria-pressed={active} onClick={() => toggle(card.id)}>
                <span className="setup-card-head"><span className="setup-index">0{index + 1}</span><span className="setup-tag">{card.tag}</span></span>
                <span className="setup-icon"><Icon size={20} /></span>
                <strong>{card.title}</strong>
                <p>{card.copy}</p>
                <span className="setup-sources"><small>SOURCES</small>{card.sources.map((source) => <b key={source}>{source}</b>)}</span>
                <span className="select-indicator">{active ? <Check size={15} /> : <Plus size={15} />}</span>
              </button>
            );
          })}
        </section>
        <div className="setup-bottom">
          <span><b>{selected.length}</b> areas selected</span>
          <div className="setup-actions">
            <button className="setup-skip" onClick={() => onContinue([])}>Skip for now</button>
            <button className="primary-auth" disabled={selected.length === 0} onClick={() => onContinue(selected)}>Continue <ArrowRight size={17} /></button>
          </div>
        </div>
      </main>
    </div>
  );
}

type AuthMode = 'login' | 'create' | 'verify' | 'forgot';
const SESSION_KEY = 'allabout-session-until';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function readRememberedSession(): boolean {
  try {
    return Number(localStorage.getItem(SESSION_KEY)) > Date.now();
  } catch {
    return false;
  }
}

type AuthGateProps = {
  forceLogin?: boolean;
  onEnterDesk?: () => void;
  onReturnToLanding?: () => void;
};

function AuthGate({forceLogin = false, onEnterDesk, onReturnToLanding}: AuthGateProps = {}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [authenticated, setAuthenticated] = useState(() => !forceLogin && readRememberedSession());
  const [features, setFeatures] = useState<string[] | null>(null);
  const [notice, setNotice] = useState('');
  const enter = (remember = keepSignedIn) => {
    try {
      if (remember) localStorage.setItem(SESSION_KEY, String(Date.now() + THIRTY_DAYS_MS));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* private mode */
    }
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
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* private mode */
    }
    setAuthenticated(false);
    setFeatures(null);
    setMode('login');
  };
  if (authenticated && features) return <Workspace onReturnToLanding={onReturnToLanding} />;
  if (authenticated) return <CampusSetup onContinue={(selected) => { setFeatures(selected); onEnterDesk?.(); }} onLogout={logOut} />;
  if (entering) {
    return (
      <div className="launch-screen" aria-label="Entering AllAbout Campus">
        <div className="launch-orbit" />
        <div className="launch-logo">a.</div>
        <p>AllAbout <b>Campus</b></p>
        <span>Opening your desk.</span>
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
          <span className="auth-kicker">University of Toronto</span>
          <h1>It’s all about<br />the page.</h1>
          <p>Ask once. We keep the official source in view.</p>
        </div>
        <div className="auth-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      </aside>
      <main className="auth-main">
        <div className="auth-top"><span>ALLABOUT CAMPUS</span></div>
        <section className="auth-card">
          <h2>{isVerify ? 'Check your inbox' : isForgot ? 'Reset password' : mode === 'create' ? 'Create account' : 'Welcome'}</h2>
          <p>
            {isVerify
              ? notice
              : isForgot
                ? 'We’ll send you a verification code.'
                : mode === 'create'
                  ? 'Choose email or phone to get started.'
                  : 'Enter your campus desk.'}
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
          {mode === 'login' && (
            <label className="remember-session">
              <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
              <span>Keep me signed in for 30 days</span>
            </label>
          )}
          {mode === 'login' && <p className="auth-foot">New here? <button onClick={() => setMode('create')}>Create an account</button></p>}
          {mode === 'create' && <p className="auth-foot">Already registered? <button onClick={() => setMode('login')}>Sign in</button></p>}
        </section>
      </main>
    </div>
  );
}

function App() {
  const [showLanding, setShowLanding] = useState(true);
  if (showLanding) {
    return <AuthGate forceLogin onEnterDesk={() => setShowLanding(false)} onReturnToLanding={() => setShowLanding(true)} />;
  }
  return <Workspace onReturnToLanding={() => setShowLanding(true)} />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
