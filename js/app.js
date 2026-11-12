import { UI, detectLang, saveLang } from './i18n.js';
import { LANGS, validateCategories, validateSteps, describeJsonError } from './validate.js';
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
let lastStepScroll = null; // route key of the last step the app scrolled to
let searchQuery = ''; // retained when returning from a step, never saved to storage
let searchOpen = false;
const languagePicker = document.querySelector('.language-picker');
const languageToggle = document.getElementById('language-toggle');
const languageMenu = document.getElementById('language-menu');
const LANGUAGE_NAMES = { en: 'English', ru: 'Русский' };
const themeToggle = document.getElementById('theme-toggle');
const systemDarkTheme = window.matchMedia('(prefers-color-scheme: dark)');
let selectedTheme = null;
try {
  const storedTheme = localStorage.getItem('checklist.theme');
  if (storedTheme === 'light' || storedTheme === 'dark') selectedTheme = storedTheme;
} catch {
  // Theme switching still works for this session when storage is unavailable.
}

class ContentError extends Error {
  constructor(messages) {
    super(messages.join('\n'));
    this.name = 'ContentError';
    this.messages = messages;
  }
}

// ---------- content loading ----------

// Saved copies of content JSON, so "Try again" and a lost connection still work.
const CONTENT_CACHE = 'tgappcheck-content-v1'; // bump to drop every saved copy

function saveOfflineCopy(path, text) {
  try {
    caches.open(CONTENT_CACHE).then((cache) => cache.put(path, new Response(text))).catch(() => {});
  } catch {
    // Cache Storage unavailable (insecure context or old webview): online only.
  }
}

async function readOfflineCopy(path) {
  try {
    const cached = await caches.match(path);
    if (cached && cached.ok) return await cached.text();
  } catch {
    // Unavailable or broken cache: report no copy.
  }
  return null;
}

async function fetchContent(path, validateFn) {
  // Relative path (site lives under /<repo>/); no-cache = always revalidate, so edits show up without a rebuild.
  let text = null;
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
    saveOfflineCopy(path, text);
  } catch (networkError) {
    const offline = await readOfflineCopy(path);
    if (offline === null) {
      const reason = networkError instanceof Error ? networkError.message : String(networkError);
      throw new ContentError([`${path}: ${reason}`]);
    }
    text = offline;
  }
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

// "#/c/<id>" and "#/c/<id>/<step>" open a category; anything else is home,
// including Telegram's launch hash "#tgWebAppData=…".
function parseRoute(hash) {
  let match = /^#\/c\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash);
  if (match) return { name: 'category', id: match[1], stepId: match[2] };
  match = /^#\/c\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash);
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
  const done = progress.countComplete(categoryId, steps);
  if (done === steps.length) return UI[lang].allDone;
  return UI[lang].progress.replace('{done}', String(done)).replace('{total}', String(steps.length));
}

function updateStorageWarning() {
  const warning = screen.querySelector('.progress-warning');
  if (warning) warning.hidden = progress.canSave;
}

function cardProgress(categoryId) {
  const status = el('span', { className: 'card-status' });
  const count = el('span', { className: 'card-progress', 'aria-live': 'polite', text: UI[lang].loading });
  status.append(count);
  // Each card can still be opened when another category's content is unavailable.
  loadContent(`content/steps/${categoryId}.json`, validateSteps).then(
    ({ steps }) => {
      count.textContent = progressText(categoryId, steps);
      const done = progress.countComplete(categoryId, steps);
      if (done === 0 || done === steps.length) return;
      // A button, not a link: <a> cannot nest inside the card's own <a>.
      const step = steps.find((entry) => !progress.isComplete(categoryId, entry.id));
      const resume = el('button', {
        type: 'button',
        className: 'card-resume',
        text: UI[lang].resume.replace('{n}', String(steps.indexOf(step) + 1)),
      });
      resume.addEventListener('click', (event) => {
        event.preventDefault(); // stop the card link's navigation
        event.stopPropagation();
        location.hash = `#/c/${categoryId}/${step.id}`;
      });
      status.append(resume);
    },
    () => { count.textContent = UI[lang].progressUnavailable; },
  );
  return status;
}

// ---------- views ----------

function homeView(categories) {
  const fragment = document.createDocumentFragment();
  // Hidden until every category's steps have loaded; any failure keeps it hidden.
  const fill = el('span', { className: 'progress-total-fill' });
  const track = el('span', { className: 'progress-total-track', role: 'progressbar', 'aria-valuemin': '0' }, fill);
  const label = el('span', { className: 'progress-total-text' });
  const total = el(
    'p',
    { className: 'progress-total', 'aria-live': 'polite', hidden: true },
    track,
    label,
  );
  const continueAction = el('a', { className: 'continue-action', hidden: true });
  const browse = el('div', { className: 'home-browse' });
  const input = el('input', {
    type: 'search',
    name: 'q',
    value: searchQuery,
    placeholder: UI[lang].searchSteps,
    'aria-label': UI[lang].searchSteps,
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'search',
  });
  const clear = el('button', {
    type: 'button',
    className: 'search-clear',
    'aria-label': UI[lang].clearSearch,
    text: '×',
  });
  const search = el('form', { id: 'step-search', className: 'search', role: 'search' },
    el('div', { className: 'search-field' }, input, clear));
  search.hidden = !searchOpen;
  const searchToggle = el('button', {
    type: 'button',
    className: 'search-toggle',
    'aria-label': UI[lang].searchSteps,
    title: UI[lang].searchSteps,
    'aria-expanded': String(searchOpen),
    'aria-controls': 'step-search',
  }, el('span', { className: 'search-icon', 'aria-hidden': 'true' }));
  const status = el('p', { className: 'search-status', role: 'status' });
  const retry = el('button', { type: 'button', className: 'retry', text: UI[lang].retry });
  retry.addEventListener('click', () => render());
  const warning = el('div', { className: 'search-warning', hidden: true },
    el('p', { text: UI[lang].searchIncomplete }), retry);
  const matchesList = el('ul', { className: 'card-list' });
  const searchResults = el('section', { 'aria-label': UI[lang].searchResults, hidden: true },
    status, warning, matchesList);
  let entries = null;
  let unavailable = false;

  function updateSearch() {
    const query = input.value.trim().toLocaleLowerCase(lang);
    clear.hidden = input.value.length === 0;
    browse.hidden = query.length > 0;
    searchResults.hidden = query.length === 0;
    if (!query) {
      matchesList.replaceChildren();
      return;
    }
    if (entries === null) {
      status.textContent = UI[lang].loading;
      return;
    }
    const words = query.split(/\s+/);
    const matches = entries.filter((entry) => words.every((word) => entry.text.includes(word)));
    warning.hidden = !unavailable;
    status.textContent = matches.length > 0 || unavailable
      ? UI[lang].searchCount.replace('{count}', String(matches.length))
      : UI[lang].searchEmpty;
    matchesList.replaceChildren(...matches.map(({ category, step }) =>
      el('li', {}, el('a', { className: 'card', href: `#/c/${category.id}/${step.id}` },
        el('div', { className: 'card-copy' },
          el('span', { className: 'search-category', text: category.title[lang] }),
          el('span', { className: 'card-title', text: step.title[lang] }),
          step.summary ? el('span', { className: 'card-description', text: step.summary[lang] }) : null,
        ),
      )),
    ));
  }

  function changeQuery() {
    searchQuery = input.value;
    updateSearch();
  }
  function setSearchOpen(open) {
    searchOpen = open;
    search.hidden = !open;
    searchToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      input.focus();
    } else {
      input.value = '';
      changeQuery();
      searchToggle.focus();
    }
  }
  searchToggle.addEventListener('click', () => setSearchOpen(!searchOpen));
  input.addEventListener('input', changeQuery);
  search.addEventListener('submit', (event) => event.preventDefault());
  clear.addEventListener('click', () => {
    input.value = '';
    changeQuery();
    input.focus();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setSearchOpen(false);
    }
  });
  fragment.append(
    el('section', { className: 'intro' },
      el('h2', { text: UI[lang].introTitle }),
      el('p', { text: UI[lang].introText }),
    ),
    el('div', { className: 'home-tools' }, total, searchToggle),
    search,
    searchResults,
    browse,
  );
  browse.append(
    continueAction,
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
  Promise.all(categories.map((category) =>
    loadContent(`content/steps/${category.id}.json`, validateSteps).then(
      ({ steps }) => ({ steps, done: progress.countComplete(category.id, steps), total: steps.length }),
      () => null, // one unavailable category hides the line; its card shows why
    ),
  )).then((results) => {
    unavailable = results.includes(null);
    entries = results.flatMap((part, index) => part ? part.steps.map((step) => ({
      category: categories[index],
      step,
      text: [step.title[lang], step.summary?.[lang] || '', ...(step.details?.[lang] || [])]
        .join('\n').toLocaleLowerCase(lang),
    })) : []);
    updateSearch();
    if (results.includes(null)) return;
    const done = results.reduce((sum, part) => sum + part.done, 0);
    const count = results.reduce((sum, part) => sum + part.total, 0);
    total.hidden = false;
    track.setAttribute('aria-valuemax', String(count));
    track.setAttribute('aria-valuenow', String(done));
    fill.style.width = `${Math.round((done / count) * 100)}%`;
    label.textContent = UI[lang].progressTotal
      .replace('{done}', String(done))
      .replace('{total}', String(count));
    const nextCategory = results.findIndex((part) => part.done < part.total);
    if (nextCategory !== -1) {
      const category = categories[nextCategory];
      const step = results[nextCategory].steps.find((entry) => !progress.isComplete(category.id, entry.id));
      continueAction.href = `#/c/${category.id}/${step.id}`;
      continueAction.append(
        el('span', { className: 'continue-label', text: done === 0 ? UI[lang].startChecklist : UI[lang].continueChecklist }),
        el('span', { className: 'continue-next', text: `${category.title[lang]} · ${step.title[lang]}` }),
      );
      continueAction.hidden = false;
    }
  });
  updateSearch();
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

function phrasesView(phrases) {
  return el('details', { className: 'phrases' },
    el('summary', {}, el('span', { text: UI[lang].chinesePhrases }),
      el('span', { className: 'phrases-indicator', 'aria-hidden': 'true', text: '+' })),
    el('ul', { className: 'phrase-list' }, ...phrases.map((phrase) => {
      const status = el('span', { className: 'phrase-copy-status', role: 'status' });
      const copy = el('button', { type: 'button', className: 'phrase-copy', text: UI[lang].copyChinese });
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(phrase.zh);
          status.textContent = UI[lang].copied;
        } catch {
          status.textContent = UI[lang].copyFailed;
        }
      });
      return el('li', { className: 'phrase' },
        el('p', { className: 'phrase-meaning', text: phrase.meaning[lang] }),
        el('p', { className: 'phrase-chinese', lang: 'zh-Hans', text: phrase.zh }),
        el('p', { className: 'phrase-pinyin', lang: 'zh-Latn', text: phrase.pinyin }),
        copy, status);
    })),
  );
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
  if (!step.details && links.length === 0 && !step.phrases?.length) {
    item.append(head);
    return item;
  }
  head.append(el('span', { className: 'chevron', 'aria-hidden': 'true', text: '›' }));
  const body = el('div', { className: 'step-body' });
  if (step.details) body.append(detailsContent(step.details[lang]));
  if (step.phrases?.length) body.append(phrasesView(step.phrases));
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
  const updateCount = () => {
    count.textContent = progressText(category.id, steps);
    if (!tgApi || !tg.HapticFeedback) return;
    if (progress.countComplete(category.id, steps) === steps.length) {
      tg.HapticFeedback.notificationOccurred('success');
    } else {
      tg.HapticFeedback.selectionChanged();
    }
  };
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

  if (!isCategory || !route.stepId) lastStepScroll = null;

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
    if (token === renderToken) {
      show(categoryView(category, steps));
      // A "#/c/<id>/<step>" route opens and scrolls to that step, once per route.
      if (route.stepId && lastStepScroll !== `${route.id}/${route.stepId}`) {
        lastStepScroll = `${route.id}/${route.stepId}`;
        const target = screen.querySelector(`[data-step-id="${route.stepId}"]`);
        if (target) {
          const details = target.querySelector('details');
          if (details) details.open = true;
          target.scrollIntoView({ block: 'start' });
        }
      }
    }
  } catch (error) {
    if (token === renderToken) show(errorView(error));
  }
}

function applyTheme() {
  const automaticTheme = inTelegram ? tg.colorScheme : (systemDarkTheme.matches ? 'dark' : 'light');
  const theme = selectedTheme || automaticTheme;
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', String(theme === 'dark'));
}

function setLanguageMenuOpen(open, returnFocus = false) {
  languageMenu.hidden = !open;
  languageToggle.setAttribute('aria-expanded', String(open));
  if (open) languageMenu.querySelector(`[data-lang="${lang}"]`).focus();
  else if (returnFocus) languageToggle.focus();
}

function applyLang() {
  document.documentElement.lang = lang;
  document.title = UI[lang].appTitle;
  document.getElementById('app-title').textContent = UI[lang].appTitle;
  themeToggle.setAttribute('aria-label', UI[lang].darkMode);
  document.getElementById('language-code').textContent = lang.toUpperCase();
  languageToggle.setAttribute('aria-label', `${UI[lang].language}: ${LANGUAGE_NAMES[lang]}`);
  languageMenu.setAttribute('aria-label', UI[lang].language);
  for (const button of languageMenu.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-checked', String(button.dataset.lang === lang));
  }
}

// ---------- startup ----------

for (const code of LANGS) {
  const option = el('button', {
    type: 'button',
    role: 'menuitemradio',
    'aria-checked': 'false',
    'data-lang': code,
    lang: code,
    tabindex: '-1',
    text: LANGUAGE_NAMES[code],
  });
  option.addEventListener('click', () => {
    if (code !== lang) {
      lang = code;
      saveLang(lang);
      applyLang();
      render();
    }
    setLanguageMenuOpen(false, true);
  });
  languageMenu.append(el('li', { role: 'none' }, option));
}
languageToggle.addEventListener('click', () => setLanguageMenuOpen(languageMenu.hidden));
languageToggle.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    setLanguageMenuOpen(true);
  }
});
languagePicker.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !languageMenu.hidden) {
    event.preventDefault();
    setLanguageMenuOpen(false, true);
  } else if (event.key === 'Tab') {
    setLanguageMenuOpen(false, !languageMenu.hidden);
  }
});
languageMenu.addEventListener('keydown', (event) => {
  const options = [...languageMenu.querySelectorAll('[data-lang]')];
  const index = options.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (index + 1) % options.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = options.length - 1;
  if (next !== undefined) {
    event.preventDefault();
    options[next].focus();
  }
});
document.addEventListener('click', (event) => {
  if (!languagePicker.contains(event.target)) setLanguageMenuOpen(false);
});
languagePicker.addEventListener('focusout', (event) => {
  if (!languagePicker.contains(event.relatedTarget)) setLanguageMenuOpen(false);
});
applyLang();
applyTheme();
themeToggle.addEventListener('click', () => {
  selectedTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('checklist.theme', selectedTheme);
  } catch {
    // Keep the choice in memory for this session.
  }
  applyTheme();
});
systemDarkTheme.addEventListener('change', applyTheme);
if (inTelegram) tg.onEvent('themeChanged', applyTheme);
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
// Widget deep link: a t.me/<bot>?startapp=cat-<id> launch opens that category.
// Only from a home route: never overrides an explicit #/c/… in the address.
const startParam =
  (inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ||
  new URLSearchParams(location.search).get('tgWebAppStartParam') ||
  '';
const deepLink = /^cat-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(startParam);
if (deepLink && parseRoute(location.hash).name === 'home') {
  location.hash = `#/c/${deepLink[1]}`;
}
render();
