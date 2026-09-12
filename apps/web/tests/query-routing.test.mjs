import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryInput, classifyQuestion } from '../src/live.ts';
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
      'uoft-events',
      'student-life-events',
    ]);
  });

  it('keeps assignment questions on public calendars', () => {
    assert.equal(classifyQuestion('When is CSC207 Assignment 2 due?'), 'assignment');
    const input = buildQueryInput('When is CSC207 Assignment 2 due?');
    assert.deepEqual(input.sourceIds, [
      'academic-calendar-csc207',
      'reddit-uoft-csc207',
      'piazza-login',
    ]);
    assert.equal(input.scope.course, 'CSC207H1');
  });
});

describe('fixed search architecture', () => {
  it('detects sites before a split for every question kind', () => {
    const cases = [
      ['What are the prerequisites for CSC207H1?', 3],
      ['When is the Labour Day Carillon Recital?', 3],
      ['When is the Arts & Science December 2026 exam period?', 3],
      ['When is CSC207 Assignment 2 due?', 3],
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

  it('gives every catalog site a coverage solution', () => {
    const hard = COVERAGE_CATALOG.filter((site) => site.access !== 'readable');
    assert.ok(hard.length >= 8);
    for (const site of hard) {
      assert.ok(site.solution.length > 20);
    }
    assert.equal(coverageForKind('assignment').some((site) => site.id === 'quercus-login'), true);
    assert.equal(coverageForKind('course').some((site) => site.id === 'timetable-builder'), true);
    assert.equal(coverageForKind('event').some((site) => site.id === 'hart-house-events'), true);
  });
});
