import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {collectActivity,mergeActivity} from '../src/activity.ts';
import {contextTotals} from '../src/context.ts';
const source=readFileSync(new URL('../src/nexus-engine.js',import.meta.url),'utf8');
const sse=source.slice(source.indexOf('async function* readSSE('),source.indexOf('function mergeToolCalls('));
const streaming=source.slice(source.indexOf('async function streamChat('),source.indexOf('// src/ui/send.js'));
function harness(fetch) {
 const store={apiKey:'test-placeholder',settings:{showDebug:false,openrouter:{}},modelMap:{test:{}},isStreaming:false};
 const scope={collectActivity,mergeActivity,store,fetch,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,API_BASE:'https://openrouter.ai/api/v1',
  extractProviderInfo:()=>({}),extractReasoningPayloadFromMessage:d=>({text:d.reasoning||'',details:d.reasoning_details||[]}),extractAssistantText:d=>d.content||'',
  modelSupportsParam:()=>false,buildReasoningRequest:()=>({}),buildOpenRouterOptions:()=>({}),applicationHeaders:()=>({}),
  mergeToolCalls:()=>{},joinBase64Chunks:()=>'',createApiError:(message,extras)=>Object.assign(new Error(message),extras),apiErrorMessage:(p,f)=>p?.error?.message||f};
 vm.createContext(scope);vm.runInContext(sse+streaming+'\nthis.run=streamChat;',scope);return {scope,store};
}
function response(chunks) {
 const bytes=new TextEncoder().encode(chunks.map(p=>'data: '+(typeof p==='string'?p:JSON.stringify(p))+'\r\n\r\n').join(''));
 return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
test('OpenRouter SSE: fragmented reasoning, content, usage-only terminal chunk and cleanup',async()=>{
 let sent; const {scope,store}=harness(async(url,opt)=>{sent=JSON.parse(opt.body);return response([
 {choices:[{delta:{reasoning:'Denken'}}]}, {choices:[{delta:{content:'Hallo'}}]},
 {choices:[],usage:{prompt_tokens:120,completion_tokens:40,completion_tokens_details:{reasoning_tokens:30}}}, '[DONE]']);});
 const tokens=[];let done;await scope.run([{role:'user',content:'Hi'}],'test',{},(t,k)=>tokens.push([t,k]),v=>done=v,e=>{throw e});
 assert.equal(sent.stream,true);assert.equal(done.usage.prompt_tokens,120);assert.equal(done.usage.completion_tokens_details.reasoning_tokens,30);
 assert.deepEqual(tokens,[['Denken','reasoning'],['Hallo','content']]);assert.equal(store.isStreaming,false);assert.equal(store.abortCtrl,null);
});
test('OpenRouter non-streaming response preserves usage and text',async()=>{
 const {scope}=harness(async()=>Response.json({choices:[{message:{content:'Antwort'}}],usage:{prompt_tokens:3,completion_tokens:2}}));
 let done;let content;await scope.run([],'test',{streaming:false},t=>content=t,v=>done=v,e=>{throw e});assert.equal(content,'Antwort');assert.equal(done.usage.completion_tokens,2);
});
test('OpenRouter HTTP and mid-stream errors end loading state',async()=>{
 for(const fetch of [async()=>Response.json({error:{message:'Invalid key'}},{status:401}),async()=>response([{error:{message:'Provider error'}}])]){
 const {scope,store}=harness(fetch);let error;await scope.run([],'test',{},()=>{},()=>assert.fail('unexpected success'),e=>error=e);assert.ok(error);assert.equal(store.isStreaming,false);assert.equal(store.abortCtrl,null);
 }
});
test('Cancellation returns aborted completion and clears loading',async()=>{
 const {scope,store}=harness((u,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason))));
 let done;const pending=scope.run([],'test',{},()=>{},v=>done=v,e=>{throw e});store.abortCtrl.abort();await pending;assert.equal(done.aborted,true);assert.equal(store.isStreaming,false);
});
test('Context meter handles unknown limits, overflows and invalid segment values',()=>{
 const input={model:'test',demo:false,omitted:0,clipped:0,limit:100,segments:[{id:'a',label:'a',tokens:120},{id:'b',label:'b',tokens:-20},{id:'c',label:'c',tokens:NaN}]};
 assert.deepEqual(contextTotals(input),{used:120,limit:100,free:0,share:1.2});assert.equal(contextTotals({...input,limit:0}).share,0);
});

test('Dynamic router prices sort after fixed prices in both directions',async()=>{
 const {tokenPrices,compareTokenPrices,distinctAnswer}=await import('../src/pricing.ts');
 const router={pricing:{prompt:'-1',completion:'-1'}}, cheap={pricing:{prompt:'0.00000001',completion:'0.00000004'}};
 assert.equal(tokenPrices(router.pricing).prompt,null);
 assert.ok(compareTokenPrices(router,cheap)>0); assert.ok(compareTokenPrices(router,cheap,true)>0);
 assert.equal(distinctAnswer('Same text','Same  text'),''); assert.equal(distinctAnswer('391','Calculate 17*23'),'391');
});

test('New chats inherit the selected model and explicit model overrides still win',()=>{
 const body=source.slice(source.indexOf('  newChat(model) {'),source.indexOf('  deleteChat(id) {'));
 const context={uuid:()=> 'new-id',pickDefaultModel:()=> 'default-expensive'}; vm.createContext(context);
 const obj=vm.runInContext('({chats:[],getChat(){return {model:"cheap-selected"}},save(){},'+body+'})',context);
 assert.equal(obj.newChat().model,'cheap-selected');assert.equal(obj.newChat('explicit-cheap').model,'explicit-cheap');
});
test('Reasoning off is sent explicitly for supported models',()=>{
 const fn=source.slice(source.indexOf('function buildReasoningRequest('),source.indexOf('// src/core/icons.js'));
 const context={modelSupportsReasoning:()=>true,modelSupportsParam:()=>true,REASONING_MODES:['off','low','auto']};vm.createContext(context);vm.runInContext(fn+'this.build=buildReasoningRequest;',context);
 assert.equal(context.build({},'off').reasoning.enabled,false);assert.equal(context.build({},'low').reasoning.effort,'low');
});


test('Search lifecycle, citations and usage are forwarded independently of reasoning',async()=>{
 const {scope}=harness(async()=>response([
 {choices:[{delta:{reasoning:'Ich könnte im Internet suchen.'}}]},
 {type:'response.web_search_call.in_progress',item_id:'s1'},
 {type:'response.web_search_call.completed',item_id:'s1'},
 {choices:[{delta:{annotations:[{type:'url_citation',url_citation:{url:'https://example.com',title:'Quelle'}}],content:'Ergebnis'}}]},
 {choices:[],usage:{server_tool_use:{web_search_requests:1}}},'[DONE]']));
 const events=[];let done;await scope.run([],'test',{},(t,k,m)=>{if(k==='activity')events.push(m.events)},v=>done=v,e=>{throw e});
 assert.equal(events[0][0].status,'running');assert.equal(events[1][0].status,'done');
 assert.ok(done.activityEvents.some(e=>e.kind==='sources'&&e.count===1));assert.ok(done.activityEvents.some(e=>e.id==='search-usage'&&e.count===1));
});
