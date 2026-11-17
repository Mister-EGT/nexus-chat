import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('API Explorer retains the complete OpenAPI catalog and completion operation', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/openrouter-catalog.json', import.meta.url), 'utf8'));
  assert.equal(catalog.openapi, '3.1.0');
  assert.equal(Object.keys(catalog.paths).length, 111);
  assert.ok(catalog.paths['/chat/completions']?.post);
  assert.ok(catalog.components.schemas);
});
