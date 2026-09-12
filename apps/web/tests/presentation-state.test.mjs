import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {eventStreamHeaders, presentationState} from '../src/live.ts';

const base = {
  id: 'run-1', question: 'test', createdAt: 0, mode: 'LIVE_WEB',
  executionKind: 'steel_live_web', viewerState: 'unavailable', status: 'browsing',
  viewerUrl: null, viewerClosed: false, viewerReason: null, currentUrl: null,
  lastPage: null, capturedPages: [], activities: [], answer: null, error: null,
  clarification: null, lastSeq: 0,
};

describe('presentationState', () => {
  it('does not call a local fixture live', () => {
    assert.equal(presentationState({...base, mode: 'LOCAL_FIXTURE', executionKind: 'local_fixture'}), 'local_demo_running');
  });

  it('shows a live viewer only after the backend marks it ready', () => {
    assert.equal(presentationState(base), 'live_connecting');
    assert.equal(presentationState({...base, viewerState: 'ready', viewerUrl: 'https://viewer.example.test'}), 'live_viewer_ready');
  });

  it('maps every terminal status to one explicit result state', () => {
    assert.equal(presentationState({...base, status: 'completed'}), 'answer_ready');
    assert.equal(presentationState({...base, status: 'partial'}), 'partial_answer');
    assert.equal(presentationState({...base, status: 'failed'}), 'failed');
    assert.equal(presentationState({...base, status: 'cancelled'}), 'cancelled');
  });
});

describe('event stream resume headers', () => {
  it('omits the cursor for a new run', () => {
    assert.deepEqual(eventStreamHeaders('run-1', 0), {accept: 'text/event-stream'});
  });

  it('sends the last acknowledged sequence when reconnecting', () => {
    assert.deepEqual(eventStreamHeaders('run-1', 7), {
      accept: 'text/event-stream',
      'Last-Event-ID': 'run-1:7',
    });
  });
});
