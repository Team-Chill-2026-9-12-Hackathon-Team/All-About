import test from 'node:test';
import assert from 'node:assert/strict';
import {readHistory,readPreferences,HISTORY_KEY,SETTINGS_KEY} from '../src/history.ts';
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const record={id:'example',question:'What are the prerequisites for CSC207H1?',status:'completed',mode:'LIVE_WEB',createdAt:Date.now()};
test('corrupt and non-array history does not break the interface',()=>{
 for(const raw of ['{bad','null','{}','3']){values.set(HISTORY_KEY,raw);assert.deepEqual(readHistory(),[]);}
});
test('invalid records are discarded',()=>{
 values.set(HISTORY_KEY,JSON.stringify([record,{...record,id:'bad',question:5},null]));
 const restored=readHistory();assert.equal(restored.length,1);assert.equal(restored[0].mode,'LIVE_WEB');
});
test('history is bounded to forty valid queries',()=>{
 values.set(HISTORY_KEY,JSON.stringify(Array.from({length:50},(_,i)=>({...record,id:String(i)}))));assert.equal(readHistory().length,40);
});
test('preferences use safe defaults and retain valid page animation settings',()=>{
 values.set(SETTINGS_KEY,'null');assert.deepEqual(readPreferences(),{motion:'slide',follow:true});
 values.set(SETTINGS_KEY,JSON.stringify({motion:'page',follow:false}));assert.deepEqual(readPreferences(),{motion:'page',follow:false});
});
