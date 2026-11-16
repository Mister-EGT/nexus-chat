import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollImmediately, createStreamPresenter } from '../src/stream-presentation.ts';
function setup(reducedMotion=false) {
 let clock=0, next=0; const frames=new Map(), output=[];
 const stream=createStreamPresenter((answer,reasoning)=>output.push({answer,reasoning}),{
  raf:cb=>{frames.set(++next,cb);return next;}, cancel:id=>frames.delete(id), reducedMotion
 });
 return {stream,output,frames,tick(){clock+=16;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(cb=>cb(clock));}};
}
test('Bursts reveal progressively, stay ordered and never invent text',()=>{
 const h=setup();const answer='Ein langer Absatz. '.repeat(80), reasoning='Gedanke. '.repeat(20);
 h.stream.push({answer,reasoning});h.tick();assert.ok(h.output[0].answer.length>0&&h.output[0].answer.length<answer.length);
 let previous='';for(let i=0;i<60;i++){h.tick();const latest=h.output.at(-1).answer;assert.ok(latest.startsWith(previous));assert.ok(answer.startsWith(latest));previous=latest;}
 assert.equal(h.output.at(-1).answer,answer);assert.equal(h.output.at(-1).reasoning,reasoning);h.stream.dispose();
});
test('Completion drains in at most 160ms without dropping final text',async()=>{
 const h=setup();h.stream.push({answer:'Anfang'});h.tick();const done=h.stream.finish({answer:'Ende '.repeat(1000),reasoning:'Vollständig'});
 for(let i=0;i<10;i++)h.tick();await done;assert.equal(h.output.at(-1).answer,'Ende '.repeat(1000));assert.equal(h.frames.size,0);
});
test('Cancellation removes queued frames and reduced motion shows complete chunks',()=>{
 const h=setup();h.stream.push({answer:'Nicht mehr rendern'});h.stream.dispose();h.tick();assert.equal(h.output.length,0);
 const r=setup(true);r.stream.push({answer:'Alles sofort'});r.tick();assert.equal(r.output[0].answer,'Alles sofort');r.stream.dispose();
});
test('Surrogate pairs remain intact, corrected final text replaces a prefix safely',async()=>{
 const h=setup();h.stream.push({answer:'😀'.repeat(30)});h.tick();assert.ok(!/[\uD800-\uDBFF]$/.test(h.output.at(-1).answer));
 const done=h.stream.finish({answer:'Korrigiert',reasoning:''});for(let i=0;i<10;i++)h.tick();await done;assert.equal(h.output.at(-1).answer,'Korrigiert');
});
test('Completion also settles when animation frames are suspended',async()=>{
 const h=setup();await h.stream.finish({answer:'Hintergrund',reasoning:''});assert.equal(h.output.at(-1).answer,'Hintergrund');assert.equal(h.frames.size,0);
});

test('Finalization promotes the live message instead of rebuilding the chat',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../src/nexus-engine.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function completeStreamMessage('),source.indexOf('function maybeAutoScroll('));
 let promoted,disposed=false,scrollTop=0;
 const live={querySelectorAll:()=>[],removeAttribute(name){assert.equal(name,'id');},classList:{remove(name){assert.equal(name,'streaming-msg');}}};
 const container={scrollTo({top}){scrollTop=top},get scrollTop(){return scrollTop},set scrollTop(n){scrollTop=n},scrollHeight:600};
 const scope={document:{getElementById:id=>id==='typing-ind'?live:container},store:{settings:{autoScroll:true}},
  streamPresenter:{finish:async value=>assert.equal(value.answer,'Final'),dispose:()=>disposed=true},completionScrollCleanup:undefined,preserveCompletedScroll:()=>()=>{},scrollImmediately,streamFinishing:false,streamScroll:{following:true},
  renderMessages:()=>assert.fail('The transcript must not be rebuilt'),createMessageEl:(msg,chat,node)=>promoted=node,
  removeTypingIndicator:()=>{},highlightCode:()=>{},isNearBottom:()=>true};
 vm.createContext(scope);vm.runInContext(fn+'this.run=completeStreamMessage;',scope);
 await scope.run({content:'Final'},{});assert.equal(promoted,live);assert.ok(disposed);assert.equal(scope.streamFinishing,false);assert.equal(scope.store.isStreaming,false);assert.equal(scrollTop,600);
});

test('Promoting a shell never detaches the scrollable live answer or thinking subtree',async()=>{
 const {promoteMessageShell}=await import('../src/stream-presentation.ts');
 const removed=[];const parent={childNodes:[],get firstChild(){return this.childNodes[0]||null},removeChild(node){removed.push(node);this.childNodes.splice(this.childNodes.indexOf(node),1)},insertBefore(node,cursor){assert.ok(!this.childNodes.includes(node),'Existing live subtree must not be moved');this.childNodes.splice(cursor?this.childNodes.indexOf(cursor):this.childNodes.length,0,node)}};
 const node=id=>({id,get nextSibling(){return parent.childNodes[parent.childNodes.indexOf(this)+1]||null}});
 const old=node('old'),thinking=node('thinking'),answer=node('answer'),header=node('header'),thinkingSlot=node('slot1'),answerSlot=node('slot2'),meta=node('meta');
 parent.childNodes=[old,thinking,answer];
 promoteMessageShell(parent,{children:[header,thinkingSlot,answerSlot,meta]},new Map([[thinkingSlot,thinking],[answerSlot,answer]]));
 assert.deepEqual(parent.childNodes,[header,thinking,answer,meta]);assert.deepEqual(removed,[old]);
});

test('Manual PageUp suspends auto-follow even inside the old 180px threshold',async()=>{
 const {createScrollFollower}=await import('../src/stream-presentation.ts');
 const listeners=new Map();let top=850;
 const el={scrollTo({top:v}){top=Math.min(1000,v)},scrollHeight:1600,clientHeight:600,get scrollTop(){return top},set scrollTop(v){top=Math.min(1000,v)},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const follow=createScrollFollower(el,true);assert.equal(follow.following,true);
 listeners.get('keydown')({key:'PageUp'});follow.pin();assert.equal(top,850);assert.equal(follow.following,false);
 top=1000;listeners.get('scroll')();assert.equal(follow.following,true);follow.dispose();assert.equal(listeners.size,0);
});

test('Finalization restores manual reading position and the inner thinking scroll',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const source=readFileSync(new URL('../src/nexus-engine.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function completeStreamMessage('),source.indexOf('function maybeAutoScroll('));
 const inner={scrollTop:174,scrollTo({top}){this.scrollTop=top}};const container={scrollTop:537,scrollHeight:2500,scrollTo({top}){this.scrollTop=top}};
 const live={querySelectorAll:()=>[inner],removeAttribute(){},classList:{remove(){}}};
 const scope={document:{getElementById:id=>id==='typing-ind'?live:container},store:{settings:{autoScroll:true}},streamPresenter:{finish:async()=>{},dispose(){}},streamScroll:{following:false},completionScrollCleanup:undefined,preserveCompletedScroll:()=>()=>{},scrollImmediately,streamFinishing:false,
 renderMessages:()=>assert.fail('no rebuild'),createMessageEl:()=>{container.scrollTop=0;inner.scrollTop=0},removeTypingIndicator(){},highlightCode(){}};
 vm.createContext(scope);vm.runInContext(fn+'this.run=completeStreamMessage;',scope);await scope.run({content:'Final'},{});
 assert.equal(container.scrollTop,537);assert.equal(inner.scrollTop,174);
});

test('Stream scrolling bypasses smooth CSS instead of setting an animated scrollTop',()=>{
 let position=50;const calls=[];
 const el={get scrollTop(){return position},set scrollTop(v){assert.fail('CSS-smoothed setter must not be used')},scrollTo(options){calls.push(options);position=options.top}};
 scrollImmediately(el,850);assert.equal(position,850);assert.deepEqual(calls,[{top:850,behavior:'instant'}]);
});

test('Final viewport survives late layout commits and stops restoring on user input',async()=>{
 const {preserveCompletedScroll}=await import('../src/stream-presentation.ts');
 for (const following of [false,true]) {
  const frames=new Map(),listeners=new Map();let id=0;const calls=[];
  const el={isConnected:true,scrollTop:417,scrollHeight:1500,firstElementChild:null,
   scrollTo(options){assert.equal(options.behavior,'instant');this.scrollTop=options.top;calls.push(options.top)},
   addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:name=>listeners.delete(name)};
  const stop=preserveCompletedScroll(el,following,{raf:cb=>{frames.set(++id,cb);return id},cancel:id=>frames.delete(id)});
  // A late layout update changes scroll position before the final commit frame.
  el.scrollTop=0;el.scrollHeight=1800;const first=[...frames.values()];frames.clear();first.forEach(cb=>cb(16));
  assert.equal(el.scrollTop,following?1800:417);
  listeners.get('touchstart')();el.scrollTop=225;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(32));
  assert.equal(el.scrollTop,225);assert.equal(listeners.size,0);stop();
 }
});

test('Viewport protection includes delayed content after the former completion timeout',async()=>{
 const {preserveCompletedScroll}=await import('../src/stream-presentation.ts');
 const previousObserver=globalThis.ResizeObserver;let resize;const frames=new Map(),listeners=new Map();let id=0;
 globalThis.ResizeObserver=class {constructor(callback){resize=callback}observe(){}disconnect(){}};
 const el={isConnected:true,scrollTop:7400,scrollHeight:8000,firstElementChild:{},scrollTo({top}){this.scrollTop=top},addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:name=>listeners.delete(name)};
 let stop;
 try {
  stop=preserveCompletedScroll(el,true,{raf:cb=>{frames.set(++id,cb);return id},cancel:id=>frames.delete(id)});
  for(let n=0;n<2;n++){const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(n*16));}
  await new Promise(resolve=>setTimeout(resolve,650));el.scrollHeight=8500;el.scrollTop=0;resize();
  const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(700));assert.equal(el.scrollTop,8500);
  listeners.get('wheel')();el.scrollTop=5000;resize();assert.equal(frames.size,0);
 } finally {stop?.();globalThis.ResizeObserver=previousObserver;}
});
