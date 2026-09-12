import test from 'node:test';
import assert from 'node:assert/strict';
import {readHistory,readPreferences,classify,visitedSources,HISTORY_KEY,SETTINGS_KEY} from '../src/history.ts';
const values=new Map();
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const record={id:'example',question:'Has A2 been extended?',topic:'deadline',status:'done',step:5,createdAt:Date.now()};
test('corrupt and non-array history does not break the interface',()=>{
 for(const raw of ['{bad','null','{}','3']){values.set(HISTORY_KEY,raw);assert.deepEqual(readHistory(),[]);}
});
test('invalid records are discarded and interrupted requests restore as stopped',()=>{
 values.set(HISTORY_KEY,JSON.stringify([record,{...record,id:'interrupted',status:'running',step:2},{...record,step:7},{...record,topic:'invented'},{...record,question:5},null]));
 const restored=readHistory();assert.equal(restored.length,2);assert.equal(restored[1].status,'cancelled');assert.equal(visitedSources(restored[1]),2);
});
test('history is bounded to forty valid queries',()=>{
 values.set(HISTORY_KEY,JSON.stringify(Array.from({length:50},(_,i)=>({...record,id:String(i)}))));assert.equal(readHistory().length,40);
});
test('preferences use safe defaults and retain valid page animation settings',()=>{
 values.set(SETTINGS_KEY,'null');assert.deepEqual(readPreferences(),{motion:'slide',follow:true});
 values.set(SETTINGS_KEY,JSON.stringify({motion:'page',follow:false}));assert.deepEqual(readPreferences(),{motion:'page',follow:false});
});
test('only visited pages become available and unsupported inquiries have no sources',()=>{
 assert.equal(visitedSources(null),0);assert.equal(visitedSources({...record,step:0}),0);assert.equal(visitedSources({...record,step:2}),2);assert.equal(visitedSources(record),3);assert.equal(visitedSources({...record,topic:'unknown'}),0);
});
test('supported question wording includes English and Chinese; unknown remains explicit',()=>{
 assert.equal(classify('Has Assignment 2 been extended?'),'deadline');assert.equal(classify('截止日期是什么'),'deadline');assert.equal(classify('PDF 格式'),'format');assert.equal(classify('迟交怎么办'),'late');assert.equal(classify('Book me a flight'),'unknown');
});
