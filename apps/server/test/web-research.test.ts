import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import type { QueryPlan, PageSnapshot } from '@allabout/contracts';
import { createSemanticAnswer, createWebResearchPlanner, focusedPageText, publicSearchUrl } from '../src/web-research.js';
const scope = {school:'University of Toronto',campus:'UTSG',term:'Fall 2026',course:null,section:null,entity:null};
const plan: QueryPlan = {runId:'test',input:{query:'reading week',scope,mode:'LIVE_WEB'},targets:[{id:'source',kind:'official',label:'Dates',entryUrl:'https://utoronto.ca/dates',allowedHosts:['utoronto.ca'],scope,contentMode:'live',access:'public'}],requestedFields:['answer'],budget:{maxPages:3,maxSteps:8,timeoutMs:90000}};
const page: PageSnapshot = {id:'p1',sourceId:'source',url:'https://utoronto.ca/dates',title:'Dates',text:'Fall 2026 reading week: November 2–6, 2026. Prerequisite: MAT135.',fetchedAt:new Date().toISOString(),publishedAt:null,updatedAt:null,scope,kind:'official',contentMode:'live'};
const candidate = {snapshotId:'p1',text:'Fall 2026 reading week: November 2–6, 2026.',quote:'Fall 2026 reading week: November 2–6, 2026.',directlyAnswersQuestion:true,matchesCourseAndTerm:true,opinion:false};
function client(claims: unknown[]) {return {responses:{parse:vi.fn().mockResolvedValue({output_parsed:{claims,limitations:[]}})}} as unknown as OpenAI;}
describe('question-grounded web research', () => {
 it('keeps relevant text from deep in a long page while reducing synthesis input',()=>{
  const longText = `Navigation ${'noise '.repeat(6000)}\nFall 2026 reading week: November 2–6, 2026.\n${'footer '.repeat(2000)}`;
  const focused = focusedPageText('When is Fall 2026 reading week?', longText);
  expect(focused.length).toBeLessThanOrEqual(24_000);
  expect(focused).toContain('Fall 2026 reading week: November 2–6, 2026.');
 });
 it('discovers sources beyond the registry, including forums, without credentials',async()=>{
  const create=vi.fn().mockResolvedValue({output:[{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://www.reddit.com/r/UofT/comments/123',title:'Student discussion'},{type:'url_citation',url:'https://www.utsc.utoronto.ca/registrar/dates',title:'Wrong campus'},{type:'url_citation',url:'http://127.0.0.1/private',title:'Invalid'}]}]}]});
  const result=await createWebResearchPlanner({responses:{create}} as unknown as OpenAI,'test')('test',plan.input,[],new AbortController().signal);
  expect('targets' in result && result.targets).toMatchObject([{kind:'community',access:'public',allowedHosts:['www.reddit.com']}]);
  expect('targets' in result && result.targets).toHaveLength(1);
  expect(create.mock.calls[0]![0].tools).toEqual([{type:'web_search'}]);
 });
 it.each(['http://example.com','https://127.0.0.1','https://localhost','https://secret:pass@example.com','https://host.internal','https://[::1]'])('rejects unsafe discovered URL %s',url=>expect(publicSearchUrl(url)).toBeNull());
 it('keeps directly relevant verbatim evidence',async()=>{
  const answer=await createSemanticAnswer(client([{...candidate,text:'Reading week runs in early November.'}]),'test')(plan,{pages:[page],failures:[],cleanup:'released'},new AbortController().signal);
  expect(answer.summary[0]?.text).toContain('November 2');expect(answer.unknowns).toEqual([]);
  expect(answer.claims[0]?.text).toBe(candidate.quote);
 });
 it('deterministically excludes a different academic term even if the model accepts it',async()=>{
  const winter={...candidate,text:'Winter Reading Week.',quote:'February 15-19, 2027 Winter Reading Week - no classes'};
  const answer=await createSemanticAnswer(client([candidate,winter]),'test')(plan,{pages:[{...page,text:`${page.text}\n${winter.quote}`}],failures:[],cleanup:'released'},new AbortController().signal);
  expect(answer.summary.map(item=>item.text)).toEqual([candidate.quote]);
 });
 it.each([
  {...candidate,directlyAnswersQuestion:false,text:'Prerequisite: MAT135.',quote:'Prerequisite: MAT135.'},
  {...candidate,matchesCourseAndTerm:false},
  {...candidate,quote:'Invented professor name'},
 ])('does not present irrelevant, stale or invented evidence as an answer',async claim=>{
  const answer=await createSemanticAnswer(client([claim]),'test')(plan,{pages:[page],failures:[],cleanup:'released'},new AbortController().signal);
  expect(answer.claims).toEqual([]);expect(answer.unknowns.length).toBeGreaterThan(0);
 });
 it('labels community evidence separately and does not certify it as institutional',async()=>{
  const answer=await createSemanticAnswer(client([candidate]),'test')(plan,{pages:[{...page,kind:'community'}],failures:[],cleanup:'released'},new AbortController().signal);
  expect(answer.summary).toEqual([]);expect(answer.communityNotes).toHaveLength(1);expect(answer.evidence[0]?.authority).toBe('unknown');expect(answer.unknowns.length).toBeGreaterThan(0);
 });
 it('propagates API failures instead of generating a keyword answer',async()=>{
  const broken={responses:{create:vi.fn().mockRejectedValue(new Error('No credits'))}} as unknown as OpenAI;
  await expect(createWebResearchPlanner(broken,'test')('test',plan.input,[],new AbortController().signal)).rejects.toThrow('No credits');
 });
});

it('never falls back to fixed pages after a LIVE_WEB planner failure', async () => {
  const { createRunRuntime } = await import('../src/runtime.js');
  const { RunStore } = await import('../src/run-store.js');
  const store = new RunStore({createId: () => 'quota-test'});
  store.create(plan.input);
  const collectPages = vi.fn();
  const runtime = createRunRuntime({sources:plan.targets,runStore:store,collectPages,
    planRun:async()=>{throw new Error('No API credits');}});
  runtime.runExecutor.start('quota-test');
  await vi.waitFor(()=>expect(store.getSnapshot('quota-test').status).toBe('failed'));
  expect(collectPages).not.toHaveBeenCalled();
  expect(store.getSnapshot('quota-test').answer).toBeNull();
});
