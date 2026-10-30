// Only completion IDs are stored. Valid content IDs cannot contain '/'.
const STORAGE_KEY = 'checklist.progress.v1';

export function createProgressStore(getStorage = () => window.localStorage) {
  let completed = new Set();
  let canSave = true;
  try {
    const saved = getStorage().getItem(STORAGE_KEY);
    if (saved !== null) {
      const entries = JSON.parse(saved);
      if (!Array.isArray(entries) || !entries.every((entry) => typeof entry === 'string')) {
        throw new Error('Invalid saved progress');
      }
      completed = new Set(entries);
    }
  } catch {
    // Keep unreadable data untouched; show the same warning as blocked storage.
    canSave = false;
  }

  const key = (categoryId, stepId) => `${categoryId}/${stepId}`;
  return {
    get canSave() {
      return canSave;
    },
    isComplete(categoryId, stepId) {
      return completed.has(key(categoryId, stepId));
    },
    setComplete(categoryId, stepId, checked) {
      const entry = key(categoryId, stepId);
      if (checked) completed.add(entry);
      else completed.delete(entry);
      if (canSave) {
        try {
          getStorage().setItem(STORAGE_KEY, JSON.stringify([...completed]));
        } catch {
          // Preserve the current in-memory state, but never claim it was saved.
          canSave = false;
        }
      }
    },
    countComplete(categoryId, steps) {
      // Count only current steps, not removed IDs still present in storage.
      return steps.filter((step) => completed.has(key(categoryId, step.id))).length;
    },
  };
}
