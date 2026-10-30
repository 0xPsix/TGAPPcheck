import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgressStore } from '../js/progress.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test('completion and unchecking survive reopening the store', () => {
  const storage = memoryStorage();
  const first = createProgressStore(() => storage);
  first.setComplete('arrival', 'sim', true);
  const reopened = createProgressStore(() => storage);
  assert.equal(reopened.isComplete('arrival', 'sim'), true);
  reopened.setComplete('arrival', 'sim', false);
  assert.equal(createProgressStore(() => storage).isComplete('arrival', 'sim'), false);
});

test('progress follows IDs across text edits and reordering, but not category moves', () => {
  const progress = createProgressStore(() => memoryStorage());
  progress.setComplete('arrival', 'sim', true);
  const steps = [{ id: 'sim', title: 'Old title' }, { id: 'bank' }];
  assert.equal(progress.countComplete('arrival', steps), 1);
  const reordered = [{ id: 'bank' }, { id: 'sim', title: 'New title' }];
  assert.equal(progress.countComplete('arrival', reordered), 1);
  assert.equal(progress.isComplete('arrival', reordered[1].id), true);
  assert.equal(progress.isComplete('preparation', 'sim'), false);
});

test('removed steps do not inflate counts and new IDs start incomplete', () => {
  const progress = createProgressStore(() => memoryStorage());
  progress.setComplete('arrival', 'removed', true);
  progress.setComplete('arrival', 'current', true);
  assert.equal(progress.countComplete('arrival', [{ id: 'current' }, { id: 'new' }]), 1);
  assert.equal(progress.isComplete('arrival', 'new'), false);
  assert.equal(progress.countComplete('arrival', []), 0);
});

test('repeated completion does not double-count', () => {
  const progress = createProgressStore(() => memoryStorage());
  progress.setComplete('arrival', 'sim', true);
  progress.setComplete('arrival', 'sim', true);
  assert.equal(progress.countComplete('arrival', [{ id: 'sim' }]), 1);
});

test('blocked storage keeps progress in memory and exposes an unsaved state', () => {
  const progress = createProgressStore(() => { throw new Error('Storage blocked'); });
  assert.equal(progress.canSave, false);
  progress.setComplete('arrival', 'sim', true);
  assert.equal(progress.isComplete('arrival', 'sim'), true);
  progress.setComplete('arrival', 'sim', false);
  assert.equal(progress.isComplete('arrival', 'sim'), false);
});

test('a write failure preserves loaded and newly checked progress in memory', () => {
  const storage = memoryStorage();
  createProgressStore(() => storage).setComplete('arrival', 'saved', true);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  const progress = createProgressStore(() => storage);
  assert.equal(progress.canSave, true);
  progress.setComplete('arrival', 'unsaved', true);
  assert.equal(progress.canSave, false);
  assert.equal(progress.countComplete('arrival', [{ id: 'saved' }, { id: 'unsaved' }]), 2);
  const reopened = createProgressStore(() => storage);
  assert.equal(reopened.isComplete('arrival', 'saved'), true);
  assert.equal(reopened.isComplete('arrival', 'unsaved'), false);
});

test('unreadable saved data is not overwritten and does not block session progress', () => {
  for (const bad of ['{broken', '{}', '[null]']) {
    const storage = memoryStorage();
    storage.setItem('checklist.progress.v1', bad);
    const progress = createProgressStore(() => storage);
    assert.equal(progress.canSave, false);
    progress.setComplete('arrival', 'sim', true);
    assert.equal(progress.isComplete('arrival', 'sim'), true);
    assert.equal(storage.getItem('checklist.progress.v1'), bad);
  }
});
