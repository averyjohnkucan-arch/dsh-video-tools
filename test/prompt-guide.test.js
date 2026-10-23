import test from 'node:test';
import assert from 'node:assert/strict';
import {Context} from '@deepseek-ai/cordis';
import {createPromptPreparation,promptGuide,guideSources} from '../lib/prompt-guide.js';
test('guide is ephemeral, session scoped, and removed on submission without editing history',async()=>{
 const ctx=new Context();let enabled=true;const flow=createPromptPreparation(ctx,()=>enabled);
 const agent={session:{}},other={session:{}},user={role:'user',content:[{type:'text',text:'A chicken'}]};
 const step=(a,messages=[user])=>ctx.waterfall('agent/pre-step',{agent:a},async()=>({kind:'enter',messages,startsRequestSeries:true}));
 assert.equal((await step(agent)).messages.length,1);
 const receipt=flow.prepare({agent});assert.equal(receipt.prepared,true);assert.ok(!JSON.stringify(receipt).includes(promptGuide));assert.equal(guideSources.length,2);
 assert.equal(flow.prepared({agent}),false,'prepare alone cannot bypass the guide in the same tool batch');const prepared=await step(agent);assert.equal(flow.prepared({agent}),true);assert.equal(prepared.startsRequestSeries,true);assert.equal(prepared.messages[1].content[0].text,promptGuide);assert.equal((await step(other)).messages.length,1);
 assert.equal((await step(agent,prepared.messages)).messages.length,2,'no duplicate injection');assert.equal(prepared.messages.length,2,'input is not mutated');
 flow.consume({agent});assert.equal((await step(agent,prepared.messages)).messages.length,1,'stale ephemeral guidance is removed');assert.equal((await step(agent)).messages[0],user);
 flow.prepare({agent});assert.equal((await step(agent)).messages.length,2,'another clip can prepare again');enabled=false;assert.equal((await step(agent)).messages.length,1);
 enabled=true;flow.clear();assert.equal((await step(agent)).messages.length,1);
 await ctx.fiber.dispose();assert.equal((await step(agent)).messages.length,1);
});
test('rejected steps stay rejected and missing agents do not leak guidance',async()=>{
 const ctx=new Context();const flow=createPromptPreparation(ctx);assert.equal(flow.prepare({}).prepared,false);const agent={session:{}};flow.prepare({agent});const rejection={kind:'reject',reason:'stopped'};
 assert.equal(await ctx.waterfall('agent/pre-step',{agent},async()=>rejection),rejection);await ctx.fiber.dispose();
});
