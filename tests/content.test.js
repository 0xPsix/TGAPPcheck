import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCategories, validateSteps, describeJsonError } from '../js/validate.js';

const scriptPath = fileURLToPath(new URL('../scripts/validate-content.js', import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const text = (en, ru) => ({ en, ru });

function hasMessage(errors, fragment) {
  return errors.some((message) => message.includes(fragment));
}

function makeContentDir(files) {
  const dir = fs.mkdtempSync(os.tmpdir() + '/content-');
  tempDirs.push(dir);
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  }
  return dir;
}

function runCli(dir) {
  const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}

test('accepts a minimal step', () => {
  assert.deepEqual(validateSteps({ steps: [{ id: 'a', title: text('A', 'А') }] }), []);
});

test('accepts a step with every optional field', () => {
  const step = {
    id: 'full-step',
    title: text('Title', 'Заголовок'),
    summary: text('Summary', 'Кратко'),
    details: { en: ['Paragraph', '- Bullet'], ru: ['Абзац', '- Пункт'] },
    links: [{ label: text('Link', 'Ссылка'), url: 'https://example.com/page' }],
  };
  assert.deepEqual(validateSteps({ steps: [step] }), []);
});

test('reports a missing Russian title', () => {
  const errors = validateSteps({ steps: [{ id: 'a', title: { en: 'A' } }] });
  assert.ok(hasMessage(errors, '"title.ru"'), errors.join('\n'));
});

test('reports duplicate step ids', () => {
  const step = { id: 'a', title: text('A', 'А') };
  const errors = validateSteps({ steps: [step, { ...step }] });
  assert.ok(hasMessage(errors, 'duplicate id "a"'), errors.join('\n'));
});

test('reports a misspelled field', () => {
  const errors = validateSteps({ steps: [{ id: 'a', title: text('A', 'А'), tittle: text('A', 'А') }] });
  assert.ok(hasMessage(errors, 'unknown field "tittle"'), errors.join('\n'));
});

test('rejects non-http link urls', () => {
  const links = [{ label: text('L', 'С'), url: 'javascript:alert(1)' }];
  const errors = validateSteps({ steps: [{ id: 'a', title: text('A', 'А'), links }] });
  assert.ok(hasMessage(errors, '"url"'), errors.join('\n'));
});

test('rejects a category id with spaces and capitals', () => {
  const errors = validateCategories({ categories: [{ id: 'First Steps', title: text('F', 'П') }] });
  assert.ok(hasMessage(errors, '"id"'), errors.join('\n'));
});

test('category descriptions are optional, but require both languages when present', () => {
  const category = { id: 'preparation', title: text('Preparation', 'Подготовка') };
  assert.deepEqual(validateCategories({ categories: [category] }), []);
  assert.deepEqual(validateCategories({
    categories: [{ ...category, description: text('Before departure', 'Перед вылетом') }],
  }), []);
  for (const description of [{ en: 'Before departure' }, { en: 'Before departure', ru: ' ' }, 'Before departure']) {
    const errors = validateCategories({ categories: [{ ...category, description }] });
    assert.ok(hasMessage(errors, '"description'), errors.join('\n'));
  }
});

test('JSON errors point to a line', () => {
  const source = '{\n  "steps": [],\n}';
  let parseError;
  try {
    JSON.parse(source);
  } catch (error) {
    parseError = error;
  }
  assert.ok(parseError, 'expected JSON.parse to fail');
  assert.match(describeJsonError(source, parseError), /line 3/);
});

test('CLI fails when a listed category has no steps file', () => {
  const dir = makeContentDir({
    'categories.json': { categories: [{ id: 'missing-cat', title: text('M', 'М') }] },
  });
  const { status, output } = runCli(dir);
  assert.equal(status, 1, output);
  assert.match(output, /file not found/);
});

test('CLI only warns about an unlisted steps file', () => {
  const dir = makeContentDir({
    'categories.json': { categories: [{ id: 'a', title: text('A', 'А') }] },
    'steps/a.json': { steps: [{ id: 'one', title: text('One', 'Один') }] },
    'steps/draft.json': { steps: [] },
  });
  const { status, output } = runCli(dir);
  assert.equal(status, 0, output);
  assert.match(output, /warning:/);
  assert.match(output, /draft\.json/);
});
