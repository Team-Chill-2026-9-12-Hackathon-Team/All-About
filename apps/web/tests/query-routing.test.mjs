import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryInput, classifyQuestion, pagesFromAnswer } from '../src/live.ts';
import { COVERAGE_CATALOG, coverageForKind } from '../src/coverage-catalog.ts';
import { detectSearch, searchPhase } from '../src/search-architecture.ts';

describe('question routing', () => {
  it('sends two calendars for a CSC207 course question', () => {
    assert.equal(classifyQuestion('What are the prerequisites for CSC207H1?'), 'course');
    const input = buildQueryInput('What are the prerequisites for CSC207H1?');
    assert.deepEqual(input.sourceIds, [
      'academic-calendar-csc207',
      'cs-undergrad-courses',
      'timetable-builder',
    ]);
    assert.equal(input.scope.course, 'CSC207H1');
  });

  it('sends exam pages for an exam-period question', () => {
    assert.equal(classifyQuestion('When is the Arts & Science December 2026 exam period?'), 'exam');
    const input = buildQueryInput('When is the Arts & Science December 2026 exam period?');
    assert.deepEqual(input.sourceIds, [
      'academic-calendar-sessional-dates',
      'artsci-exam-conflicts',
      'artsci-academic-dates',
    ]);
  });

  it('sends two event pages for the carillon recital', () => {
    assert.equal(classifyQuestion('When is the Labour Day Carillon Recital?'), 'event');
    const input = buildQueryInput('When is the Labour Day Carillon Recital?');
    assert.deepEqual(input.sourceIds, [
      'alumni-carillon-recital',
      'soldiers-tower-features',
    ]);
  });

  it('routes CS program and graduation questions to the official Calendar and department', () => {
    assert.equal(classifyQuestion('What are the graduation requirements for the Computer Science Specialist?'), 'program');
    const input = buildQueryInput('What are the graduation requirements for the Computer Science Specialist?');
    assert.deepEqual(input.sourceIds, [
      'academic-calendar-cs-specialist',
      'cs-program-entry-cmp1',
      'uoft-registrar',
    ]);
    assert.equal(input.scope.entity, 'Computer Science Specialist');
  });

  it('keeps every DEMO101 question inside the labeled fixture corpus', () => {
    for (const question of ['What is the DEMO101 submission format?', 'When is the DEMO101 final exam?']) {
      const input = buildQueryInput(question);
      assert.equal(input.mode, 'LIVE_FIXTURE');
      assert.deepEqual(input.sourceIds, [
        'demo101-syllabus',
        'demo101-announcement',
        'demo101-student-discussion',
      ]);
    }
  });

  it('does not silently substitute CSC207 for an unknown course', () => {
    const input = buildQueryInput('What are the prerequisites for MAT223?');
    assert.deepEqual(input.sourceIds, ['academic-calendar-course-search', 'timetable-builder', 'cs-undergrad-courses']);
    assert.equal(input.scope.course, 'MAT223H1');
  });

  it('routes general campus questions to student services rather than a CS course', () => {
    const input = buildQueryInput('Where can I find support as a current student?');
    assert.deepEqual(input.sourceIds, ['uoft-current-students', 'uoft-registrar', 'student-life-events']);
  });
});

describe('fixed search architecture', () => {
  it('detects sites before a split for every question kind', () => {
    const cases = [
      ['What are the prerequisites for CSC207H1?', 3],
      ['When is the Labour Day Carillon Recital?', 2],
      ['When is the Arts & Science December 2026 exam period?', 3],
      ['What are the graduation requirements for the Computer Science Specialist?', 3],
    ];
    for (const [question, count] of cases) {
      const plan = detectSearch(question);
      assert.equal(plan.sourceIds.length, count);
      assert.equal(searchPhase('planning', 0, false), 'split');
      assert.equal(searchPhase('browsing', 0, false), 'split');
      assert.equal(searchPhase('browsing', 1, true), 'gather');
      assert.equal(searchPhase('completed', 1, true), 'answer');
    }
  });

  it('turns answer sources into captured pages after a missed live event', () => {
    const pages = pagesFromAnswer({
      sources: [
        {sourceId: 'academic-calendar-csc207', title: 'CSC207H1', url: 'https://artsci.calendar.utoronto.ca/course/csc207h1'},
      ],
    });
    assert.deepEqual(pages.map((page) => page.sourceId), ['academic-calendar-csc207']);
  });

  it('gives every catalog site a coverage solution', () => {
    const hard = COVERAGE_CATALOG.filter((site) => site.access !== 'readable');
    assert.ok(hard.length >= 8);
    for (const site of hard) {
      assert.ok(site.solution.length > 20);
    }
    assert.equal(coverageForKind('program').some((site) => site.id === 'academic-calendar-cs-specialist'), true);
    assert.equal(coverageForKind('course').some((site) => site.id === 'timetable-builder'), true);
    assert.equal(coverageForKind('event').some((site) => site.id === 'hart-house-events'), true);
  });
});
