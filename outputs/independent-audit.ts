import {writeFileSync} from 'node:fs';
import {buildAnswer, parseDateValue} from '../packages/evidence/src/index.ts';
import {demo101Sources,demo101Scope} from '../apps/server/src/demo101-fixtures.ts';
import {createDefaultPlan} from '../apps/server/src/run-executor.ts';
import {collectFixturePages} from '../apps/server/src/fixture-collect.ts';
import {validateAnswerBundle} from '../apps/server/src/answer-validator.ts';
import {buildQueryInput} from '../apps/web/src/live.ts';

const results:any[]=[];
const record=(name:string,actual:unknown)=>results.push({name,actual});
const input=buildQueryInput('Did the DEMO101 A2 deadline change?');
const plan=createDefaultPlan('audit-run',input,[...demo101Sources]);
const signal=new AbortController().signal;
const events:any[]=[];
const batch=await collectFixturePages(plan,e=>events.push(e),signal);
const answer=await buildAnswer(plan,batch,signal);
record('fixture execution',{cleanup:batch.cleanup,events:events.map(e=>e.type),keyDates:answer.keyDates});
for(const q of ['DEMO101 A2 deadline','DEMO101 A2 截止日期','What is the DEMO101 submission format?','When is MAT223 Assignment 2 due?','When is the DEMO101 final exam?']) record('routing: '+q,buildQueryInput(q));
const changed=structuredClone(batch);
changed.pages[0]!.text='Assignment 1 is due September 18, 2026 at 5:00 PM EDT. Assignment 2 is due September 20, 2026 at 5:00 PM EDT.';
changed.pages=changed.pages.slice(0,1);
record('two assignments on one page',(await buildAnswer(plan,changed,signal)).conflicts);
const old=structuredClone(batch);
old.pages[0]!.text='The assignment is due September 25, 2026 at 5:00 PM EDT. Submit one PDF.';
old.pages[0]!.publishedAt='2026-09-15T09:00:00-04:00';
old.pages[1]!.publishedAt='2026-09-01T09:00:00-04:00';
record('older extension beats newer syllabus',(await buildAnswer(plan,old,signal)).keyDates);
const imaginary=structuredClone(answer);
imaginary.summary[0]!.text='The deadline is January 1, 2099 and late submissions are always accepted.';
imaginary.claims.find(c=>c.id===imaginary.summary[0]!.claimIds[0])!.text=imaginary.summary[0]!.text;
try {validateAnswerBundle(plan,batch,imaginary);record('invented claim with real quote accepted',true);}catch{record('invented claim with real quote accepted',false);}
record('invalid calendar date',parseDateValue('2026-02-31'));
const wrongMode={...plan,input:{...plan.input,mode:'LIVE_WEB' as const}};
const wrongAnswer=await buildAnswer(wrongMode,batch,signal);
try{validateAnswerBundle(wrongMode,batch,wrongAnswer);record('LIVE_WEB with fixture snapshots accepted',true);}catch{record('LIVE_WEB with fixture snapshots accepted',false);}
for(const base of (process.argv.includes('--http') ? ['http://127.0.0.1:3001','http://127.0.0.1:5174'] : [])){
 const started=Date.now();
 const r=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
 const created:any=await r.json();
 if(r.status!==202){record('http '+base,{status:r.status,body:created});continue;}
 const stream=await fetch(base+created.eventsUrl);
 const raw=await stream.text();
 const envs=raw.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
 const snap:any=await (await fetch(base+'/api/runs/'+created.runId)).json();
 record('http '+base,{status:r.status,elapsedMs:Date.now()-started,runId:created.runId,terminal:snap.status,cleanup:snap.cleanup,mode:snap.answer?.mode,events:envs.map(e=>e.type),sources:snap.answer?.sources?.length,dates:snap.answer?.keyDates,unknowns:snap.answer?.unknowns});
}
writeFileSync(new URL('./independent-audit-results.json',import.meta.url),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
