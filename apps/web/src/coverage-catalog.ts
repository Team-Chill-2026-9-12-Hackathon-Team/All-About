import type { QueryKind } from './search-architecture.ts';

export type CoverageAccess = 'readable' | 'login' | 'bot_check' | 'licensed' | 'unstable';

export interface CoverageSite {
  id: string;
  label: string;
  url: string;
  access: CoverageAccess;
  covers: string;
  solution: string;
  fallbackId?: string;
}

export const COVERAGE_CATALOG: CoverageSite[] = [
  {
    id: 'academic-calendar-csc207',
    label: 'A&S Calendar CSC207',
    url: 'https://artsci.calendar.utoronto.ca/course/csc207h1',
    access: 'readable',
    covers: 'Official course facts',
    solution: 'Read the public calendar page.',
  },
  {
    id: 'academic-calendar-csc148',
    label: 'A&S Calendar CSC148',
    url: 'https://artsci.calendar.utoronto.ca/course/csc148h1',
    access: 'readable',
    covers: 'Official course facts',
    solution: 'Read the public calendar page.',
  },
  {
    id: 'cs-undergrad-courses',
    label: 'CS department',
    url: 'https://web.cs.toronto.edu/undergraduate/courses',
    access: 'readable',
    covers: 'Department course index',
    solution: 'Read the public CS undergraduate list.',
  },
  {
    id: 'timetable-builder',
    label: 'Timetable Builder',
    url: 'https://ttb.utoronto.ca/',
    access: 'readable',
    covers: 'Public offering search',
    solution: 'Read the public landing only. We do not submit a signed-in course search.',
  },
  {
    id: 'academic-calendar-sessional-dates',
    label: 'Sessional dates',
    url: 'https://artsci.calendar.utoronto.ca/sessional-dates',
    access: 'readable',
    covers: 'Faculty academic dates',
    solution: 'Read the calendar sessional-dates page.',
  },
  {
    id: 'artsci-academic-dates',
    label: 'A&S academic dates',
    url: 'https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates',
    access: 'bot_check',
    covers: 'Add/drop and faculty dates',
    solution: 'Human-check pages often have no readable text. We then open A&S sessional dates.',
    fallbackId: 'academic-calendar-sessional-dates',
  },
  {
    id: 'artsci-exam-conflicts',
    label: 'Exam conflicts',
    url: 'https://www.artsci.utoronto.ca/current/faculty-registrar/final-exams/exam-conflicts',
    access: 'bot_check',
    covers: 'Exam conflict rules',
    solution: 'If the security check stalls, we open sessional dates for the exam period.',
    fallbackId: 'academic-calendar-sessional-dates',
  },
  {
    id: 'uoft-events',
    label: 'U of T Events',
    url: 'https://www.utoronto.ca/events',
    access: 'readable',
    covers: 'Campus-wide event list',
    solution: 'Read the St. George event list.',
  },
  {
    id: 'student-life-events',
    label: 'Student Life events',
    url: 'https://www.studentlife.utoronto.ca/events/',
    access: 'readable',
    covers: 'Student service events',
    solution: 'Read the public Student Life events entry.',
  },
  {
    id: 'hart-house-events',
    label: 'Hart House events',
    url: 'https://harthouse.ca/events/month',
    access: 'unstable',
    covers: 'Hart House activities',
    solution: 'Cloudflare often blocks this host. We then open U of T Events.',
    fallbackId: 'uoft-events',
  },
  {
    id: 'alumni-carillon-recital',
    label: 'Alumni carillon',
    url: 'https://alumni.utoronto.ca/events/labour-day-carillon-recital-0',
    access: 'readable',
    covers: 'Named event detail',
    solution: 'Read the public alumni event page.',
  },
  {
    id: 'ulife-organizations',
    label: 'ULife organizations',
    url: 'https://www.ulife.utoronto.ca/organizations',
    access: 'unstable',
    covers: 'Club directory',
    solution: 'The directory is often down. We then open Student Life events.',
    fallbackId: 'student-life-events',
  },
  {
    id: 'the-varsity-about',
    label: 'The Varsity',
    url: 'https://thevarsity.ca/about/',
    access: 'unstable',
    covers: 'Student press context',
    solution: 'Direct fetches can hit Cloudflare. Steel reads the about page as context only, not policy.',
  },
  {
    id: 'reddit-uoft-csc207',
    label: 'Reddit r/UofT',
    url: 'https://old.reddit.com/r/UofT/',
    access: 'bot_check',
    covers: 'Public student discussion',
    solution: 'www.reddit.com is a login shell. We open old.reddit.com. If that is blocked, we keep the wall and use official calendar facts.',
  },
  {
    id: 'reddit-uoft',
    label: 'Reddit r/UofT',
    url: 'https://old.reddit.com/r/UofT/',
    access: 'bot_check',
    covers: 'Public student discussion',
    solution: 'www.reddit.com is a login shell. We open old.reddit.com. If that is blocked, we keep the wall and use official calendar facts.',
  },
  {
    id: 'piazza-login',
    label: 'Piazza',
    url: 'https://piazza.com/login',
    access: 'login',
    covers: 'Private class discussion',
    solution: 'UTORid login. We show the wall and do not read private posts. Public calendar covers official facts.',
  },
  {
    id: 'quercus-login',
    label: 'Quercus',
    url: 'https://q.utoronto.ca/',
    access: 'login',
    covers: 'Private course announcements',
    solution: 'UTORid login. We do not use a personal session. Assignment due dates stay unknown unless a public page states them.',
  },
  {
    id: 'acorn-login',
    label: 'ACORN',
    url: 'https://www.acorn.utoronto.ca/',
    access: 'login',
    covers: 'Personal enrolment',
    solution: 'UTORid login. We do not read personal records. Public sessional dates cover faculty deadlines.',
  },
  {
    id: 'ratemyprofessors-uoft',
    label: 'Rate My Professors',
    url: 'https://www.ratemyprofessors.com/',
    access: 'licensed',
    covers: 'Instructor opinions',
    solution: 'Terms require prior permission. We do not scrape reviews. Official calendar stays the course source.',
  },
];

const BY_KIND: Record<QueryKind, string[]> = {
  course: [
    'academic-calendar-csc207',
    'cs-undergrad-courses',
    'timetable-builder',
    'reddit-uoft-csc207',
    'ratemyprofessors-uoft',
    'quercus-login',
  ],
  assignment: [
    'academic-calendar-csc207',
    'reddit-uoft-csc207',
    'piazza-login',
    'quercus-login',
    'acorn-login',
  ],
  event: [
    'uoft-events',
    'student-life-events',
    'hart-house-events',
    'alumni-carillon-recital',
    'ulife-organizations',
    'the-varsity-about',
  ],
  exam: [
    'academic-calendar-sessional-dates',
    'artsci-exam-conflicts',
    'artsci-academic-dates',
  ],
  general: [
    'academic-calendar-csc207',
    'student-life-events',
    'uoft-events',
    'piazza-login',
    'quercus-login',
  ],
};

export function coverageSite(id: string): CoverageSite | undefined {
  return COVERAGE_CATALOG.find((site) => site.id === id);
}

export function coverageForKind(kind: QueryKind, course?: string | null): CoverageSite[] {
  const swap148 = course === 'CSC148H1';
  return BY_KIND[kind]
    .map((id) => {
      if (swap148 && id === 'academic-calendar-csc207') return coverageSite('academic-calendar-csc148');
      if (swap148 && id === 'reddit-uoft-csc207') return coverageSite('reddit-uoft');
      return coverageSite(id);
    })
    .filter((site): site is CoverageSite => site !== undefined);
}
