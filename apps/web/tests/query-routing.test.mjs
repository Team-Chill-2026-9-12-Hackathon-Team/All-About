import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryInput, classifyQuestion, currentAcademicTerm, pagesFromAnswer } from '../src/live.ts';
import { COVERAGE_CATALOG, coverageForKind } from '../src/coverage-catalog.ts';
import { detectSearch, searchPhase } from '../src/search-architecture.ts';

describe('question routing', () => {
  it('sends the current academic term with live questions', () => {
    assert.equal(currentAcademicTerm(new Date('2026-09-13T12:00:00Z')), 'Fall 2026');
    assert.equal(currentAcademicTerm(new Date('2027-02-13T12:00:00Z')), 'Winter 2027');
    assert.equal(currentAcademicTerm(new Date('2027-06-13T12:00:00Z')), 'Summer 2027');
    assert.equal(buildQueryInput('reading week').scope.term, currentAcademicTerm());
  });

  it('sends two calendars for a CSC207 course question', () => {
    assert.equal(classifyQuestion('What are the prerequisites for CSC207H1?'), 'course');
    const input = buildQueryInput('What are the prerequisites for CSC207H1?');
    assert.deepEqual(input.sourceIds, [
      'academic-calendar-csc207',
      'cs-undergrad-courses',
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
    assert.deepEqual(input.sourceIds, ['academic-calendar-course-search', 'cs-undergrad-courses']);
    assert.equal(input.scope.course, 'MAT223');
  });

  it('routes general campus questions to student services rather than a CS course', () => {
    const input = buildQueryInput('Where can I find support as a current student?');
    assert.deepEqual(input.sourceIds, ['uoft-current-students', 'uoft-registrar', 'ulife-organizations']);
  });

  it('routes personal account questions to ACORN', () => {
    const input = buildQueryInput('What is my ACORN account balance?');
    assert.deepEqual(input.sourceIds, ['acorn-login']);
  });

  it('routes an enrolled course syllabus through Quercus', () => {
    const input = buildQueryInput('PHL245 syllabus');
    assert.deepEqual(input.sourceIds, ['quercus-login', 'academic-calendar-course-search']);
    assert.equal(input.scope.course, 'PHL245');
  });

  it('routes Waterloo course and community questions to distinct source priorities', () => {
    assert.deepEqual(detectSearch('What are the prerequisites for CS 246?', 'waterloo').sourceIds,
      ['waterloo-calendar', 'waterloo-classes', 'uwflow']);
    assert.deepEqual(detectSearch('What do students say about CS 246 on Reddit?', 'waterloo').sourceIds,
      ['reddit-waterloo', 'uwflow', 'ratemyprofessors-waterloo']);
  });

  it('routes U of T campus topics to topic-specific primary sources', () => {
    assert.deepEqual(detectSearch('What housing options are available?').sourceIds,
      ['uoft-current-students', 'student-life-events', 'reddit-uoft']);
    assert.deepEqual(detectSearch('What do students say about CSC207 on Reddit?').sourceIds,
      ['reddit-uoft', 'ratemyprofessors-uoft', 'academic-calendar-course-search']);
  });

  it('sends the selected institution and campus to the backend', () => {
    const input = buildQueryInput('When is reading week?', undefined, 'waterloo');
    assert.equal(input.scope.school, 'University of Waterloo');
    assert.equal(input.scope.campus, 'Waterloo');
  });
});

describe('fixed search architecture', () => {
  it('detects sites before a split for every question kind', () => {
    const cases = [
      ['What are the prerequisites for CSC207H1?', 2],
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
    assert.equal(coverageForKind('course').some((site) => site.id === 'timetable-builder'), false);
    assert.equal(coverageForKind('event').some((site) => site.id === 'hart-house-events'), true);
  });
});
