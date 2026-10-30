import { UI, detectLang, saveLang } from './i18n.js';
import { validateCategories, validateSteps, describeJsonError } from './validate.js';
import { createProgressStore } from './progress.js';

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg?.initData);
// BackButton, openLink and openTelegramLink need Bot API 6.1+.
const tgApi = inTelegram && tg.isVersionAtLeast('6.1');

const screen = document.getElementById('screen');
const contentCache = new Map(); // path -> Promise<data>
const progress = createProgressStore();
let lang = detectLang();
let renderToken = 0;

class ContentError extends Error {
  constructor(messages) {
    super(messages.join('\n'));
    this.name = 'ContentError';
    this.messages = messages;
  }
}

// ---------- content loading ----------

async function fetchContent(path, validateFn) {
  // Relative path (site lives under /<repo>/); no-cache = always revalidate, so edits show up without a rebuild.
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new ContentError([`${path}: HTTP ${res.status}`]);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ContentError([`${path}: not valid JSON: ${describeJsonError(text, error)}`]);
  }
  const errors = validateFn(data);
  if (errors.length > 0) throw new ContentError(errors.map((message) => `${path}: ${message}`));
  return data;
}

function loadContent(path, validateFn) {
  if (!contentCache.has(path)) {
    const promise = fetchContent(path, validateFn);
    contentCache.set(path, promise);
    promise.catch(() => contentCache.delete(path)); // let "Try again" refetch
  }
  return contentCache.get(path);
}

// ---------- routing ----------

// Anything that is not "#/c/<id>" is home, including Telegram's launch hash "#tgWebAppData=…".
function parseRoute(hash) {
  const match = /^#\/c\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash);
  return match ? { name: 'category', id: match[1] } : { name: 'home' };
}

// ---------- DOM helpers (content is only ever inserted as text) ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

function notice(text) {
  return el('p', { className: 'notice', text });
}

function progressText(categoryId, steps) {
  return UI[lang].progress
    .replace('{done}', String(progress.countComplete(categoryId, steps)))
    .replace('{total}', String(steps.length));
}

function updateStorageWarning() {
  const warning = screen.querySelector('.progress-warning');
  if (warning) warning.hidden = progress.canSave;
}

function cardProgress(categoryId) {
  const count = el('span', { className: 'card-progress', 'aria-live': 'polite', text: UI[lang].loading });
  // Each card can still be opened when another category's content is unavailable.
  loadContent(`content/steps/${categoryId}.json`, validateSteps).then(
    ({ steps }) => { count.textContent = progressText(categoryId, steps); },
    () => { count.textContent = UI[lang].progressUnavailable; },
  );
  return count;
}

// ---------- views ----------

function homeView(categories) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    el('section', { className: 'intro' },
      el('h2', { text: UI[lang].introTitle }),
      el('p', { text: UI[lang].introText }),
    ),
    el('ul', { className: 'card-list' },
      ...categories.map((category) =>
        el('li', {}, el('a', { className: 'card', href: `#/c/${category.id}` },
          el('div', { className: 'card-copy' },
            el('span', { className: 'card-title', text: category.title[lang] }),
            category.description
              ? el('span', { className: 'card-description', text: category.description[lang] })
              : null,
            cardProgress(category.id),
          ),
        )),
      ),
    ),
  );
  return fragment;
}

function detailsContent(lines) {
  const fragment = document.createDocumentFragment();
  let container = fragment;
  let list = null;
  for (const line of lines) {
    const bullet = line.startsWith('- ');
    if (!bullet && line.endsWith(':')) {
      let className = 'detail-section';
      if (line === UI[lang].whatToBring) className += ' detail-section--bring';
      if (line === UI[lang].important) className += ' detail-section--important';
      container = el('section', { className }, el('h3', { text: line }));
      fragment.append(container);
      list = null;
    } else if (bullet) {
      if (!list) {
        list = el('ul');
        container.append(list);
      }
      list.append(el('li', { text: line.slice(2) }));
    } else {
      list = null;
      container.append(el('p', { text: line }));
    }
  }
  return fragment;
}

function linkView(link) {
  const anchor = el('a', { href: link.url, target: '_blank', rel: 'noopener noreferrer', text: link.label[lang] });
  if (tgApi) {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      if (link.url.startsWith('https://t.me/')) tg.openTelegramLink(link.url);
      else tg.openLink(link.url);
    });
  }
  return anchor;
}

function stepView(categoryId, step, index, onChange) {
  const head = el(
    'div',
    { className: 'step-head' },
    el('span', { className: 'step-num', text: String(index + 1) }),
    el(
      'div',
      { className: 'step-text' },
      el('span', { className: 'step-title', text: step.title[lang] }),
      step.summary ? el('span', { className: 'step-summary', text: step.summary[lang] }) : null,
    ),
  );
  const links = step.links || [];
  const item = el('li', { className: 'step', 'data-step-id': step.id });
  const checkbox = el('input', {
    type: 'checkbox',
    'aria-label': UI[lang].completedStep.replace('{title}', step.title[lang]),
  });
  checkbox.checked = progress.isComplete(categoryId, step.id);
  item.classList.toggle('is-complete', checkbox.checked);
  checkbox.addEventListener('change', () => {
    progress.setComplete(categoryId, step.id, checkbox.checked);
    item.classList.toggle('is-complete', checkbox.checked);
    onChange();
    updateStorageWarning();
  });
  // Outside <summary>: checking completion must not toggle the step details.
  item.append(el('label', { className: 'step-check' }, checkbox));
  if (!step.details && links.length === 0) {
    item.append(head);
    return item;
  }
  head.append(el('span', { className: 'chevron', 'aria-hidden': 'true', text: '›' }));
  const body = el('div', { className: 'step-body' });
  if (step.details) body.append(detailsContent(step.details[lang]));
  if (links.length > 0) {
    body.append(
      el('div', { className: 'links-title', text: UI[lang].links }),
      el('ul', { className: 'links' }, ...links.map((link) => el('li', {}, linkView(link)))),
    );
  }
  item.append(el('details', {}, el('summary', {}, head), body));
  return item;
}

function categoryView(category, steps) {
  const fragment = document.createDocumentFragment();
  const count = el('p', { className: 'progress-summary', 'aria-live': 'polite', text: progressText(category.id, steps) });
  const updateCount = () => { count.textContent = progressText(category.id, steps); };
  fragment.append(
    el('h2', { text: category.title[lang] }),
    count,
    el('ol', { className: 'steps' }, ...steps.map((step, index) => stepView(category.id, step, index, updateCount))),
  );
  return fragment;
}

function notFoundView() {
  return el(
    'div',
    { className: 'notice' },
    el('p', { text: UI[lang].notFound }),
    el('a', { href: '#/', text: UI[lang].home }),
  );
}

function errorView(error) {
  const messages = error instanceof ContentError ? error.messages : [String((error && error.message) || error)];
  const retry = el('button', { type: 'button', className: 'retry', text: UI[lang].retry });
  retry.addEventListener('click', () => render());
  return el(
    'div',
    { className: 'notice' },
    el('p', { text: UI[lang].loadError }),
    retry,
    el(
      'details',
      { className: 'error-details' },
      el('summary', { text: UI[lang].errorDetails }),
      el('pre', { text: messages.join('\n') }),
    ),
  );
}

// ---------- rendering ----------

async function render() {
  const token = ++renderToken;
  const route = parseRoute(location.hash);
  const isCategory = route.name === 'category';

  if (tgApi) {
    if (isCategory) tg.BackButton.show();
    else tg.BackButton.hide();
  }
  const show = (...nodes) => {
    const backLink = isCategory && !tgApi ? el('a', { className: 'back-link', href: '#/', text: `← ${UI[lang].home}` }) : null;
    const warning = el('p', { className: 'progress-warning', role: 'status', text: UI[lang].progressNotSaved });
    warning.hidden = progress.canSave;
    screen.replaceChildren(...(backLink ? [backLink] : []), warning, ...nodes);
  };

  show(notice(UI[lang].loading));
  try {
    const { categories } = await loadContent('content/categories.json', validateCategories);
    if (!isCategory) {
      if (token === renderToken) show(homeView(categories));
      return;
    }
    const category = categories.find((candidate) => candidate.id === route.id);
    if (!category) {
      if (token === renderToken) show(notFoundView());
      return;
    }
    const { steps } = await loadContent(`content/steps/${category.id}.json`, validateSteps);
    if (token === renderToken) show(categoryView(category, steps));
  } catch (error) {
    if (token === renderToken) show(errorView(error));
  }
}

function applyLang() {
  document.documentElement.lang = lang;
  document.title = UI[lang].appTitle;
  document.getElementById('app-title').textContent = UI[lang].appTitle;
  document.getElementById('design-toggle').textContent = UI[lang].design;
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
}

// ---------- startup ----------

applyLang();
// Temporary preview: CSS-only switch preserves navigation and expanded steps.
document.getElementById('design-toggle').addEventListener('click', (event) => {
  const enabled = document.documentElement.dataset.design !== 'red';
  if (enabled) document.documentElement.dataset.design = 'red';
  else delete document.documentElement.dataset.design;
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
});
for (const button of document.querySelectorAll('[data-lang]')) {
  button.addEventListener('click', () => {
    if (button.dataset.lang === lang) return;
    lang = button.dataset.lang;
    saveLang(lang);
    applyLang();
    render();
  });
}
if (tgApi) {
  tg.BackButton.onClick(() => {
    location.hash = '#/';
  });
}
window.addEventListener('hashchange', () => render());
if (inTelegram) {
  tg.ready();
  tg.expand();
}
render();
