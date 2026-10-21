// Checks content/*.json. Usage: node scripts/validate-content.js [contentDir]
// Exit code 1 if any error is found (this blocks the GitHub Pages deploy).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCategories, validateSteps, describeJsonError } from '../js/validate.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = path.resolve(process.argv[2] ?? path.join(repoRoot, 'content'));
const show = (file) => path.relative(process.cwd(), file) || file;

const errors = [];

// Returns parsed JSON, or undefined after recording an error.
async function readJson(file, notFoundNote = '') {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    errors.push(`${show(file)}: file not found${notFoundNote}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${show(file)}: not valid JSON: ${describeJsonError(text, error)}`);
    return undefined;
  }
}

async function listJsonFiles(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function main() {
  const categoriesFile = path.join(contentDir, 'categories.json');
  const stepsDir = path.join(contentDir, 'steps');

  const categoriesData = await readJson(categoriesFile);
  if (categoriesData === undefined) return finish(0, 0);
  const categoryErrors = validateCategories(categoriesData);
  if (categoryErrors.length > 0) {
    errors.push(...categoryErrors.map((message) => `${show(categoriesFile)}: ${message}`));
    return finish(0, 0);
  }

  const ids = categoriesData.categories.map((category) => category.id);
  let stepCount = 0;
  for (const id of ids) {
    const stepsFile = path.join(stepsDir, `${id}.json`);
    const data = await readJson(stepsFile, ` (category "${id}" is listed in categories.json)`);
    if (data === undefined) continue;
    const stepErrors = validateSteps(data);
    errors.push(...stepErrors.map((message) => `${show(stepsFile)}: ${message}`));
    if (stepErrors.length === 0) stepCount += data.steps.length;
  }

  for (const name of await listJsonFiles(stepsDir)) {
    if (!ids.includes(name.slice(0, -'.json'.length))) {
      console.warn(`warning: ${show(path.join(stepsDir, name))} is not listed in categories.json, so the app does not show it`);
    }
  }

  return finish(ids.length, stepCount);
}

function finish(categoryCount, stepCount) {
  if (errors.length > 0) {
    for (const message of errors) console.error(`error: ${message}`);
    console.error(`Content check failed: ${errors.length} error(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`Content OK (categories: ${categoryCount}, steps: ${stepCount})`);
}

await main();
