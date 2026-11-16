import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolveTheme, modifierLabel } from '../src/theme.ts';
test('Theme preference resolves the OS only for System; platform shortcuts match the device', () => {
  for (const dark of [true, false]) { assert.equal(resolveTheme('system', dark), dark ? 'dark' : 'light'); assert.equal(resolveTheme('light', dark), 'light'); assert.equal(resolveTheme('dark', dark), 'dark'); }
  for (const platform of ['MacIntel', 'iPhone', 'iPad']) assert.equal(modifierLabel(platform), '⌘');
  for (const platform of ['Win32', 'Linux x86_64']) assert.equal(modifierLabel(platform), 'Strg');
});
const source = readFileSync(new URL('../src/nexus-engine.js', import.meta.url), 'utf8');
function comparison(request) {
  const model = { id: 'test', pricing: { prompt: .00001, completion: .00002 } };
  const store = { demoMode: false, apiKey: 'test-placeholder', modelMap: { test: model }, totalCost: 0, save() {} };
  const context = { store, performance, requestOpenRouter: request, modelSupportsParam: () => false, extractAssistantText: d => d.content || '', estimateTokens: s => Math.ceil(s.length / 4), apiErrorMessage: (d,f) => d.error?.message || f, citationSources: a => a || [], renderSidebar() {} };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('export async function compareAnswer('), source.indexOf('export function saveComparison(')).replace('export ', '') + '\nthis.run=compareAnswer;', context);
  return context;
}
test('Comparison streams each delta through the existing transport and keeps usage-only terminal metrics', async () => {
  let body; const progress = [];
  const context = comparison(async (path, options) => {
    assert.equal(path, '/chat/completions'); body = options.body;
    for (const payload of [{ choices: [{ delta: { content: 'Hallo ' } }] }, { choices: [{ delta: { content: 'Welt', annotations: [{ url: 'https://example.org' }] } }] }, { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7, cost: .002 } }]) options.onEvent(payload);
    return { kind: 'events' };
  });
  const result = await context.run('test', 'Hallo', new AbortController().signal, value => progress.push(value.content));
  assert.deepEqual(progress, ['Hallo ', 'Hallo Welt']); assert.equal(body.stream, true); assert.equal(result.content, 'Hallo Welt');
  assert.equal(result.completionTokens, 7); assert.equal(result.cost, .002); assert.equal(context.store.totalCost, .002); assert.equal(result.sources.length, 1);
});
test('Comparison preserves nonstream results, propagates abort and provider errors', async () => {
  const context = comparison(async (_, options) => { assert.equal(options.body.stream, false); return { kind: 'json', data: { choices: [{ message: { content: 'Antwort' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } } }; });
  assert.equal((await context.run('test', 'Hallo', new AbortController().signal)).content, 'Antwort');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(comparison(async (_, options) => { options.signal.throwIfAborted(); }).run('test', '', abort.signal));
  await assert.rejects(comparison(async () => ({ kind: 'json', data: { error: { message: 'Provider error' } } })).run('test', '', new AbortController().signal), /Provider error/);
});
