import test from 'node:test';
import assert from 'node:assert/strict';
import { rankCommands } from '../src/command-ranking.ts';

const items = [
  { id: 'compare', label: 'Modellvergleich', keywords: 'vergleichen' },
  { id: 'chat', label: 'Mein Modellvergleich für die Schule' },
  { id: 'settings', label: 'Einstellungen', keywords: 'parameter theme' },
];
test('Command search prioritizes direct prefix matches and supports abbreviated navigation', () => {
  assert.deepEqual(rankCommands(items, 'modellv').map(item => item.id), ['compare', 'chat']);
  assert.equal(rankCommands(items, 'mdlvg')[0].id, 'compare');
  assert.equal(rankCommands(items, 'PARAMETER')[0].id, 'settings');
});
test('Empty and unmatched command queries preserve a stable list without mutating items', () => {
  const before = structuredClone(items);
  assert.deepEqual(rankCommands(items, '  '), items);
  assert.deepEqual(rankCommands(items, 'zzzz'), []);
  assert.deepEqual(items, before);
});

test('A matching long chat title stays discoverable with a one-letter query', () => {
  const chat = { id: 'long', label: 'N' + 'eue Unterhaltung '.repeat(40) };
  assert.equal(rankCommands([chat], 'n')[0]?.id, 'long');
});
