// Cloudflare Worker: answers /start with a static menu widget (Bot API 10.4).
// No state, no database: every /start builds the widget fresh from the live
// content files, so edits on github.com appear for every new /start.
//
// Deploy (see README "Bot backend"): paste this file into a Cloudflare
// Worker, set the variables below, then open /register once.
//
// Required environment variables (Worker → Settings → Variables):
//   BOT_TOKEN      (Secret)  the bot token from @BotFather
//   WEBHOOK_SECRET (Secret)  any long random string, e.g. `openssl rand -hex 16`
//   MAIN_APP_URL   (Text)    the GitHub Pages site, e.g. https://0xpsix.github.io/TGAPPcheck

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BOT_USERNAME_RE = /^[A-Za-z0-9_]{4,32}$/;

const TEXT = {
  en: {
    heading: 'Start with a section:',
    caption: 'A free checklist for international students. Tap a section to open it — the guide runs inside Telegram.',
    fallbackText: 'The menu could not load just now. Tap to open the checklist:',
  },
  ru: {
    heading: 'Начните с раздела:',
    caption: 'Бесплатный чек-лист для иностранных студентов. Нажмите на раздел — справочник откроется внутри Telegram.',
    fallbackText: 'Меню сейчас не загрузилось. Нажмите, чтобы открыть чек-лист:',
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function pickLang(languageCode) {
  return typeof languageCode === 'string' && languageCode.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

// The widget: native-styled category buttons, one per category, deep-linking
// into the Mini App via ?startapp=cat-<id>. Static: no queries, no state.
// Limits enforced by Telegram: <= 32768 bytes of HTML, <= 4096 zlib-compressed.
export function buildWidgetHTML(categories, lang, botUsername) {
  if (!BOT_USERNAME_RE.test(botUsername)) throw new Error(`Invalid bot username: ${botUsername}`);
  const buttons = categories
    .filter((category) => ID_RE.test(category.id) && category.title && isText(category.title[lang]))
    .map((category) => {
      const url = `https://t.me/${botUsername}?startapp=cat-${category.id}`;
      const description =
        category.description && isText(category.description[lang])
          ? `<p class="d">${escapeHtml(category.description[lang])}</p>`
          : '';
      return `<button onclick="TelegramWidget.openTelegramLink('${url}')">${escapeHtml(category.title[lang])}</button>${description}`;
    })
    .join('');
  return `<style>
button{display:block;width:100%;text-align:left;margin:0 0 4px}
.d{margin:0 0 14px;color:var(--tg-theme-hint-color);font-size:.92em}
.d:last-child{margin-bottom:0}
</style>
<p>${escapeHtml(TEXT[lang].heading)}</p>
${buttons}`;
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

async function tgApi(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description || 'unknown error'}`);
  return data.result;
}

async function fetchCategories(env) {
  const base = String(env.MAIN_APP_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('MAIN_APP_URL is not set');
  const res = await fetch(`${base}/content/categories.json`);
  if (!res.ok) throw new Error(`categories.json: HTTP ${res.status}`);
  return res.json();
}

async function getBotUsername(env) {
  const cached = getBotUsername.value;
  if (cached) return cached;
  const me = await tgApi(env, 'getMe', {});
  if (!BOT_USERNAME_RE.test(me.username || '')) throw new Error('Bot has no username');
  getBotUsername.value = me.username;
  return me.username;
}

async function sendMenu(env, chatId, languageCode) {
  const lang = pickLang(languageCode);
  const botUsername = await getBotUsername(env);
  try {
    const { categories } = await fetchCategories(env);
    const html = buildWidgetHTML(categories, lang, botUsername);
    await tgApi(env, 'sendWidget', { chat_id: chatId, html, caption: TEXT[lang].caption });
  } catch {
    // No widget without content (or on a sendWidget rejection): a plain
    // message with the same entry point, so /start never stays silent.
    await tgApi(env, 'sendMessage', {
      chat_id: chatId,
      text: `${TEXT[lang].fallbackText} https://t.me/${botUsername}?startapp`,
    });
  }
}

async function handleUpdate(update, env) {
  const message = update.message;
  if (!message || message.chat.type !== 'private') return;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (text.startsWith('/start') || text.startsWith('/help')) {
    await sendMenu(env, message.chat.id, message.from && message.from.language_code);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/webhook') {
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      await handleUpdate(await request.json(), env);
      return new Response('OK');
    }

    // One-time setup: point Telegram's updates at this Worker. Safe to repeat.
    if (request.method === 'GET' && url.pathname === '/register') {
      const result = await tgApi(env, 'setWebhook', {
        url: `${url.origin}/webhook`,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message'],
      });
      return Response.json(result);
    }

    return new Response('Not found', { status: 404 });
  },
};