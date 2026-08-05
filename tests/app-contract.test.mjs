import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const html = read('index.html');
const state = read('src/app-parts/01-state.js');
const boot = read('src/boot.js');
const serviceWorker = read('service-worker.js');

test('every DOM selector in application state exists in index.html', () => {
  const ids = [...state.matchAll(/querySelector\('#([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(ids.length > 50);
  for (const id of ids) assert.match(html, new RegExp(`\\bid=["']${id}["']`), `missing #${id}`);
});

test('index.html does not contain duplicate ids', () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test('the mode control is a real switch and the obsolete button is gone', () => {
  assert.match(html, /id="modeSwitch"[^>]+type="checkbox"[^>]+role="switch"/);
  assert.doesNotMatch(html, /id="modeButton"/);
});

test('every boot module and application part exists', () => {
  const imports = [...boot.matchAll(/from ['"](\.\/[^'"]+)['"]/g)].map((match) => match[1]);
  const parts = [...boot.matchAll(/['"](\.\/app-parts\/[^'"]+)['"]/g)].map((match) => match[1]);
  for (const relative of [...imports, ...parts]) assert.ok(existsSync(resolve(root, 'src', relative)), `missing src/${relative}`);
});

test('every local HTML asset exists', () => {
  const assets = [...html.matchAll(/(?:href|src)=["']\.\/([^"'#?]+)["']/g)].map((match) => match[1]);
  for (const asset of assets) assert.ok(existsSync(resolve(root, asset)), `missing ${asset}`);
});

test('the service worker precaches every boot dependency', () => {
  const cached = new Set([...serviceWorker.matchAll(/['"](\.\/[^'"]+)['"]/g)].map((match) => match[1]));
  const imports = [...boot.matchAll(/from ['"](\.\/[^'"]+)['"]/g)].map((match) => `./src/${match[1].slice(2)}`);
  const parts = [...boot.matchAll(/['"](\.\/app-parts\/[^'"]+)['"]/g)].map((match) => `./src/${match[1].slice(2)}`);
  for (const dependency of [...imports, ...parts]) assert.ok(cached.has(dependency), `offline cache is missing ${dependency}`);
  assert.ok(cached.has('./styles/practice.css'));
});
