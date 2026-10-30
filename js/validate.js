// Content rules for content/*.json. Pure functions: no DOM, no network.
// Used by the app (js/app.js) and by the check script (scripts/validate-content.js).

export const LANGS = ['en', 'ru'];

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/\S+$/;

const CATEGORY_FIELDS = ['id', 'title', 'description'];
const STEP_FIELDS = ['id', 'title', 'summary', 'details', 'links'];
const LINK_FIELDS = ['label', 'url'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function checkUnknownFields(obj, allowed, where, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      errors.push(`${where}: unknown field "${key}" (allowed: ${allowed.join(', ')})`);
    }
  }
}

function checkUnknownLanguages(obj, field, where, errors) {
  for (const key of Object.keys(obj)) {
    if (!LANGS.includes(key)) {
      errors.push(`${where}: "${field}" has unknown language "${key}" (allowed: ${LANGS.join(', ')})`);
    }
  }
}

// {"en": "...", "ru": "..."}
function checkText(value, field, where, errors) {
  if (!isObject(value)) {
    errors.push(`${where}: "${field}" must be an object with "en" and "ru" texts`);
    return;
  }
  checkUnknownLanguages(value, field, where, errors);
  for (const lang of LANGS) {
    if (!isText(value[lang])) errors.push(`${where}: "${field}.${lang}" must be non-empty text`);
  }
}

// {"en": ["...", "..."], "ru": ["..."]}
function checkTextLists(value, field, where, errors) {
  if (!isObject(value)) {
    errors.push(`${where}: "${field}" must be an object with "en" and "ru" lists`);
    return;
  }
  checkUnknownLanguages(value, field, where, errors);
  for (const lang of LANGS) {
    const list = value[lang];
    if (!Array.isArray(list) || list.length === 0) {
      errors.push(`${where}: "${field}.${lang}" must be a non-empty list of texts`);
      continue;
    }
    list.forEach((item, i) => {
      if (!isText(item)) errors.push(`${where}: "${field}.${lang}" item ${i + 1} must be non-empty text`);
    });
  }
}

function checkLinks(links, where, errors) {
  if (!Array.isArray(links)) {
    errors.push(`${where}: "links" must be a list`);
    return;
  }
  links.forEach((link, i) => {
    const linkWhere = `${where}: "links" item ${i + 1}`;
    if (!isObject(link)) {
      errors.push(`${linkWhere} must be an object with "label" and "url"`);
      return;
    }
    checkUnknownFields(link, LINK_FIELDS, linkWhere, errors);
    checkText(link.label, 'label', linkWhere, errors);
    if (typeof link.url !== 'string' || !URL_RE.test(link.url)) {
      errors.push(`${linkWhere}: "url" must start with https:// or http:// and contain no spaces`);
    }
  });
}

function itemLabel(kind, index, item) {
  const hasValidId = isObject(item) && typeof item.id === 'string' && ID_RE.test(item.id);
  return `${kind} ${index + 1}${hasValidId ? ` (id "${item.id}")` : ''}`;
}

// Shared shape: {"<listKey>": [ {...}, ... ]}
function validateList(data, listKey, kind, allowedFields, checkItem) {
  if (!isObject(data)) return ['top level: must be an object'];
  const errors = [];
  checkUnknownFields(data, [listKey], 'top level', errors);
  const list = data[listKey];
  if (!Array.isArray(list) || list.length === 0) {
    errors.push(`top level: "${listKey}" must be a non-empty list`);
    return errors;
  }
  const seenIds = new Map(); // id -> 1-based position of first use
  list.forEach((item, index) => {
    const where = itemLabel(kind, index, item);
    if (!isObject(item)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    checkUnknownFields(item, allowedFields, where, errors);
    for (const field of ['id', 'title']) {
      if (!(field in item)) errors.push(`${where}: missing required field "${field}"`);
    }
    if ('id' in item) {
      if (typeof item.id !== 'string' || !ID_RE.test(item.id)) {
        errors.push(`${where}: "id" must use only lowercase letters, digits and single hyphens, e.g. "bank-card"`);
      } else if (seenIds.has(item.id)) {
        errors.push(`${where}: duplicate id "${item.id}" (already used by ${kind} ${seenIds.get(item.id)})`);
      } else {
        seenIds.set(item.id, index + 1);
      }
    }
    if ('title' in item) checkText(item.title, 'title', where, errors);
    checkItem(item, where, errors);
  });
  return errors;
}

export function validateCategories(data) {
  return validateList(data, 'categories', 'category', CATEGORY_FIELDS, (category, where, errors) => {
    if ('description' in category) checkText(category.description, 'description', where, errors);
  });
}

export function validateSteps(data) {
  return validateList(data, 'steps', 'step', STEP_FIELDS, (step, where, errors) => {
    if ('summary' in step) checkText(step.summary, 'summary', where, errors);
    if ('details' in step) checkTextLists(step.details, 'details', where, errors);
    if ('links' in step) checkLinks(step.links, where, errors);
  });
}

// Adds "(line L, column C)" to JSON.parse errors that only report a position.
export function describeJsonError(text, error) {
  const message = String((error && error.message) || error);
  if (/\bline\b/i.test(message)) return message;
  const match = /position (\d+)/.exec(message);
  if (!match) return message;
  const position = Number(match[1]);
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  const column = position - before.lastIndexOf('\n');
  return `${message} (line ${line}, column ${column})`;
}
