import test from 'node:test';
import assert from 'node:assert/strict';
import {collectActivity,mergeActivity,describeThought,describeEvent} from '../src/activity.ts';
test('Prose mentioning search never becomes a search activity',()=>{
 assert.deepEqual(collectActivity({choices:[{delta:{reasoning:'I am searching the internet',content:'Search results'}}]}),[]);
});
test('Function search calls are requested, never falsely marked as executed',()=>{
 const event=collectActivity({},[{id:'abc',type:'function',function:{name:'web_search',arguments:'{"query":"Nexus"}'}}])[0];
 assert.equal(event.kind,'search');assert.equal(event.status,'requested');assert.equal(event.detail,'Nexus');assert.match(describeEvent(event),/angefordert/);
});
test('Provider activity updates the same search row and preserves other calls',()=>{
 let events=collectActivity({type:'response.web_search_call.in_progress',item_id:'search1'});
 events=mergeActivity(events,collectActivity({type:'response.web_search_call.completed',item_id:'search1'}));
 assert.equal(events.length,1);assert.equal(events[0].status,'done');
 assert.equal(describeEvent({...events[0],status:'running'},true),'Websuche gemeldet');
});
test('Thought headings receive semantic labels and icon kinds',()=>{
 assert.equal(describeThought('**Plan**\nFirst decide...',0).kind,'plan');
 assert.equal(describeThought('## Berechnung\n2 + 2',1).kind,'calculate');
 assert.equal(describeThought('3. Verify results\nCheck...',2).kind,'verify');
 assert.equal(describeThought('## Code review\nImplementation',3).kind,'code');
});
test('Annotations are sources, not proof of running search; unsafe URLs are ignored',()=>{
 const events=collectActivity({annotations:[{type:'url_citation',url_citation:{url:'https://example.com/a'}},{type:'url_citation',url_citation:{url:'javascript:alert(1)'}}]});
 assert.equal(events.length,1);assert.equal(events[0].kind,'sources');assert.equal(events[0].count,1);
});
