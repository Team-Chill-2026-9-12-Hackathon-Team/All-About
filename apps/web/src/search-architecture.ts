export type QueryKind = 'course' | 'event' | 'exam' | 'assignment' | 'general';
export type SearchPhase = 'detect' | 'split' | 'gather' | 'answer';

export interface SearchBlueprint {
  kind: QueryKind;
  reason: string;
  sourceIds: string[];
  requestedFields: string[];
  course: string | null;
  entity: string | null;
}

export const SEARCH_PHASES: { id: SearchPhase; label: (count: number, kind: QueryKind) => string }[] = [
  { id: 'detect', label: (_count, kind) => `Detect ${kind}` },
  { id: 'split', label: (count) => `Split ${count}` },
  { id: 'gather', label: () => 'Gather pages' },
  { id: 'answer', label: () => 'Answer' },
];

const COURSE_RE = /\b([a-z]{3})\s?-?\s?(\d{3})(h1|y1)?\b/i;

export function classifyQuestion(question: string): QueryKind {
  if (/(?:exam|finals?|deferred|conflict)/i.test(question)) return 'exam';
  if (/(?:assignment|homework|problem set|\ba\d+\b|due date|deadline|submission format|late penalty)/i.test(question)) return 'assignment';
  if (/(?:event|recital|carillon|hart house|workshop|orientation|club)/i.test(question)) return 'event';
  if (COURSE_RE.test(question)) return 'course';
  return 'general';
}

export function detectSearch(question: string): SearchBlueprint {
  const kind = classifyQuestion(question);
  const match = question.match(COURSE_RE);
  const isDemo101 = /demo\s?-?\s?101/i.test(question);
  const isCsc207 = /\bcsc\s?-?\s?207\b/i.test(question);
  const isCsc148 = /\bcsc\s?-?\s?148\b/i.test(question);
  const isCarillon = /carillon|labour day|soldiers.? tower/i.test(question);
  const assignmentMatch = question.match(/(?:assignment|\ba)\s*-?\s*(\d+)/i);
  const course = isDemo101
    ? 'DEMO101'
    : isCsc207
    ? 'CSC207H1'
    : isCsc148
      ? 'CSC148H1'
      : match
        ? `${match[1].toUpperCase()}${match[2]}${(match[3] ?? 'H1').toUpperCase()}`
        : null;

  const sourceIds: string[] = [];
  if (isDemo101) {
    sourceIds.push('demo101-syllabus', 'demo101-announcement', 'demo101-student-discussion');
  } else if (kind === 'exam') {
    sourceIds.push('academic-calendar-sessional-dates', 'artsci-exam-conflicts', 'artsci-academic-dates');
    if (isCsc207 || course === 'CSC207H1') {
      sourceIds.splice(2, 1, 'academic-calendar-csc207');
    }
  } else if (kind === 'event') {
    if (isCarillon) {
      sourceIds.push('alumni-carillon-recital', 'soldiers-tower-features');
    } else {
      sourceIds.push('uoft-events', 'student-life-events', 'hart-house-events');
    }
  } else if (kind === 'assignment') {
    if (isCsc207 || course === 'CSC207H1') {
      sourceIds.push('academic-calendar-csc207', 'piazza-login', 'quercus-login');
    } else if (isCsc148 || course === 'CSC148H1') {
      sourceIds.push('academic-calendar-csc148', 'piazza-login', 'quercus-login');
    } else {
      sourceIds.push('piazza-login', 'quercus-login');
    }
  } else if (kind === 'course') {
    if (isCsc207 || course === 'CSC207H1') {
      sourceIds.push('academic-calendar-csc207', 'cs-undergrad-courses', 'timetable-builder');
    } else if (isCsc148 || course === 'CSC148H1') {
      sourceIds.push('academic-calendar-csc148', 'cs-undergrad-courses', 'timetable-builder');
    } else {
      sourceIds.push('timetable-builder');
    }
  } else {
    sourceIds.push('academic-calendar-csc207', 'student-life-events', 'uoft-events');
  }

  const ids = [...new Set(sourceIds)].slice(0, 3);
  return {
    kind,
    reason: reasonFor(kind, ids.length),
    sourceIds: ids,
    requestedFields: fieldsFor(kind),
    course: kind === 'event' ? null : course,
    entity: kind === 'event'
      ? (isCarillon ? 'Labour Day Carillon Recital' : null)
      : kind === 'exam'
        ? 'final-exams'
        : assignmentMatch
          ? `Assignment ${assignmentMatch[1]}`
          : isDemo101 || course === 'DEMO101'
            ? 'Assignment 2'
        : null,
  };
}

export function searchPhase(
  status: string | undefined,
  capturedCount: number,
  hasCurrentUrl: boolean,
): SearchPhase {
  if (status === 'synthesizing' || status === 'completed' || status === 'partial') return 'answer';
  if (status === 'browsing') return capturedCount > 0 || hasCurrentUrl ? 'gather' : 'split';
  if (status === 'failed' || status === 'cancelled') return capturedCount > 0 ? 'gather' : 'split';
  if (status === 'queued' || status === 'planning' || status === 'needs_input') return 'split';
  return 'detect';
}

export function detectActivities(blueprint: SearchBlueprint, labels: Record<string, string> = {}) {
  return [
    {
      seq: 1,
      kind: 'plan' as const,
      title: `Detected ${blueprint.kind} question`,
      detail: blueprint.reason,
    },
    {
      seq: 2,
      kind: 'plan' as const,
      title: `Split into ${blueprint.sourceIds.length} panes`,
      detail: blueprint.sourceIds.map((id) => labels[id] ?? id).join(' · '),
    },
  ];
}

function reasonFor(kind: QueryKind, count: number): string {
  if (kind === 'assignment') return `Assignment lookup · ${count} public pages`;
  if (kind === 'exam') return `Exam lookup · ${count} faculty pages`;
  if (kind === 'event') return `Event lookup · ${count} campus listings`;
  if (kind === 'course') return `Course lookup · ${count} official and discussion pages`;
  return `Campus lookup · ${count} pages`;
}

function fieldsFor(kind: QueryKind): string[] {
  if (kind === 'assignment') return ['deadline', 'submission_format'];
  if (kind === 'exam') return ['when', 'where'];
  if (kind === 'event') return ['name', 'when', 'where'];
  return ['code', 'title', 'offering', 'prerequisites'];
}
