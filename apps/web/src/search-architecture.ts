export type Institution = 'uoft' | 'waterloo';
export type QueryKind = 'course' | 'event' | 'exam' | 'program' | 'policy' | 'service' | 'housing' | 'finance' | 'career' | 'community' | 'general';
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

const COURSE_RE = /\b([a-z]{2,4})\s?-?\s?(\d{3})(h1|y1)?\b/i;

export function classifyQuestion(question: string): QueryKind {
  if (/(?:exam|finals?|deferred|conflict)/i.test(question)) return 'exam';
  if (/(?:event|recital|carillon|hart house|workshop|orientation|club)/i.test(question)) return 'event';
  if (/(?:program|major|minor|specialist|post\b|degree|graduat(?:e|ion)|academic calendar|毕业|专业|主修|辅修|学位)/i.test(question)) return 'program';
  if (/(?:reddit|student opinion|students say|rate my professor|uwflow|community|评价|学生怎么说)/i.test(question)) return 'community';
  if (COURSE_RE.test(question)) return 'course';
  if (/(?:policy|petition|appeal|academic integrity|misconduct|规则|政策|申诉)/i.test(question)) return 'policy';
  if (/(?:residence|housing|dorm|meal plan|宿舍|住宿)/i.test(question)) return 'housing';
  if (/(?:tuition|fees?|invoice|financial aid|scholarship|osap|学费|奖学金)/i.test(question)) return 'finance';
  if (/(?:coop|co-op|career|internship|job|work term|实习|就业)/i.test(question)) return 'career';
  if (/(?:service|accessibility|health|counselling|international student|support|服务|健康)/i.test(question)) return 'service';
  return 'general';
}

export function detectSearch(question: string, institution: Institution = 'uoft'): SearchBlueprint {
  const kind = classifyQuestion(question);
  const match = question.match(COURSE_RE);
  const isDemo101 = /demo\s?-?\s?101/i.test(question);
  const isCsc207 = /\bcsc\s?-?\s?207\b/i.test(question);
  const isCsc148 = /\bcsc\s?-?\s?148\b/i.test(question);
  const isCarillon = /carillon|labour day|soldiers.? tower/i.test(question);
  const isAcorn = /\bacorn\b|tuition|invoice|financial account|account balance|my enrol(?:ment|led)|my enroll(?:ment|ed)|my timetable/i.test(question);
  const needsQuercus = /syllabus|assignment|course material|lecture|reading|announcement|quercus|my mark|my grade/i.test(question);
  const isComputerScienceProgram = /(?:computer science|\bcs\b|\bcsc\b|\bcmp1\b|计算机科学)/i.test(question);
  const course = isDemo101
    ? 'DEMO101'
    : isCsc207
    ? 'CSC207H1'
    : isCsc148
      ? 'CSC148H1'
      : match
        ? `${match[1].toUpperCase()}${match[2]}${(match[3] ?? '').toUpperCase()}`
        : null;

  const sourceIds: string[] = [];
  if (institution === 'waterloo') {
    if (kind === 'course') sourceIds.push('waterloo-calendar', 'waterloo-classes', 'uwflow');
    else if (kind === 'exam') sourceIds.push('waterloo-important-dates', 'waterloo-registrar', 'waterloo-calendar');
    else if (kind === 'event') sourceIds.push('waterloo-events', 'waterloo-student-life', 'waterloo-recreation-events');
    else if (kind === 'program') sourceIds.push('waterloo-calendar', 'waterloo-programs', 'waterloo-registrar');
    else if (kind === 'policy') sourceIds.push('waterloo-policies', 'waterloo-calendar', 'waterloo-registrar');
    else if (kind === 'housing') sourceIds.push('waterloo-housing', 'waterloo-student-life', 'reddit-waterloo');
    else if (kind === 'finance') sourceIds.push('waterloo-finance', 'waterloo-important-dates', 'waterloo-quest');
    else if (kind === 'career') sourceIds.push('waterloo-coop', 'waterloo-career', 'reddit-waterloo');
    else if (kind === 'community') sourceIds.push('reddit-waterloo', 'uwflow', 'ratemyprofessors-waterloo');
    else if (kind === 'service') sourceIds.push('waterloo-student-life', 'waterloo-registrar', 'waterloo-policies');
    else sourceIds.push('waterloo-student-life', 'waterloo-registrar', 'waterloo-events');
    return {
      kind,
      reason: reasonFor(kind, sourceIds.length),
      sourceIds: [...new Set(sourceIds)].slice(0, 3),
      requestedFields: fieldsFor(kind),
      course,
      entity: kind === 'event' ? null : kind === 'exam' ? 'final-exams' : null,
    };
  }
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
  } else if (kind === 'course') {
    if (needsQuercus) {
      sourceIds.push('quercus-login', 'academic-calendar-course-search');
    } else if (isCsc207 || course === 'CSC207H1') {
      sourceIds.push('academic-calendar-csc207', 'cs-undergrad-courses', 'timetable-builder');
    } else if (isCsc148 || course === 'CSC148H1') {
      sourceIds.push('academic-calendar-csc148', 'cs-undergrad-courses', 'timetable-builder');
    } else {
      sourceIds.push('academic-calendar-course-search', 'timetable-builder', 'cs-undergrad-courses');
    }
  } else if (kind === 'program') {
    sourceIds.push('academic-calendar-degree-requirements', 'uoft-registrar', 'uoft-current-students');
    if (isComputerScienceProgram) sourceIds.splice(0, 1, 'academic-calendar-cs-specialist', 'cs-program-entry-cmp1');
  } else if (kind === 'policy') {
    sourceIds.push('uoft-registrar', 'academic-calendar-degree-requirements', 'uoft-current-students');
  } else if (kind === 'housing') {
    sourceIds.push('uoft-current-students', 'student-life-events', 'reddit-uoft');
  } else if (kind === 'finance') {
    sourceIds.push('uoft-registrar', 'uoft-current-students', 'academic-calendar-sessional-dates');
  } else if (kind === 'career') {
    sourceIds.push('uoft-current-students', 'ulife-organizations', 'reddit-uoft');
  } else if (kind === 'community') {
    sourceIds.push('reddit-uoft', 'ratemyprofessors-uoft', 'academic-calendar-course-search');
  } else if (kind === 'service') {
    sourceIds.push('uoft-current-students', 'uoft-registrar', 'ulife-organizations');
  } else if (isAcorn) {
    sourceIds.push('acorn-login');
  } else {
    sourceIds.push('uoft-current-students', 'uoft-registrar', 'student-life-events');
  }

  const ids = [...new Set(sourceIds)].slice(0, 3);
  return {
    kind,
    reason: reasonFor(kind, ids.length),
    sourceIds: ids,
    requestedFields: fieldsFor(kind),
    course: kind === 'event' || kind === 'program' ? null : course,
    entity: kind === 'event'
      ? (isCarillon ? 'Labour Day Carillon Recital' : null)
      : kind === 'exam'
        ? 'final-exams'
        : kind === 'program' && isComputerScienceProgram
          ? 'Computer Science Specialist'
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
  if (kind === 'exam') return `Exam lookup · ${count} faculty pages`;
  if (kind === 'event') return `Event lookup · ${count} campus listings`;
  if (kind === 'course') return `Course lookup · ${count} official and discussion pages`;
  if (kind === 'program') return `Program and degree lookup · ${count} official pages`;
  if (kind === 'community') return `Student experience lookup · ${count} official and community pages`;
  if (kind === 'policy') return `Policy lookup · ${count} governing pages`;
  return `Campus lookup · ${count} pages`;
}

function fieldsFor(kind: QueryKind): string[] {
  if (kind === 'exam') return ['when', 'where'];
  if (kind === 'event') return ['name', 'when', 'where'];
  if (kind === 'program') return ['requirements', 'eligibility'];
  if (kind === 'policy') return ['rule', 'scope', 'next_step'];
  if (kind === 'housing') return ['eligibility', 'cost', 'deadline'];
  if (kind === 'finance') return ['amount', 'deadline', 'eligibility'];
  if (kind === 'career') return ['eligibility', 'process', 'deadline'];
  if (kind === 'community') return ['student_experience', 'official_context'];
  if (kind === 'service') return ['service', 'eligibility', 'contact'];
  if (kind === 'general') return ['answer'];
  return ['code', 'title', 'offering', 'prerequisites'];
}
