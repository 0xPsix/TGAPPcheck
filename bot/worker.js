// Cloudflare Worker: /start menu widget and /feedback replies.
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
//   FEEDBACK_CHAT_ID (Text)  recipient chat ID; use /chatid in the bot to find yours

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BOT_USERNAME_RE = /^[A-Za-z0-9_]{4,32}$/;

const TEXT = {
  en: {
    heading: 'Start with a section:',
    caption: 'A free checklist for international students. Tap a section to open it — the guide runs inside Telegram. Use /feedback to report an issue.',
    fallbackText: 'The menu could not load just now. Tap to open the checklist:',
    feedbackPrompt: 'Reply to this message with your feedback. Your reply will be forwarded to the project team with Telegram’s sender attribution. Do not include private documents, passwords or payment details.',
    feedbackSent: 'Thank you — your feedback has been sent.',
    feedbackFailed: 'Your feedback could not be delivered. Please reply to the feedback prompt again later.',
    feedbackUnavailable: 'Feedback is not configured yet. Please try again later.',
    chatId: 'Your chat ID: {id}. Set this as FEEDBACK_CHAT_ID in Cloudflare to receive feedback here.',
  },
  ru: {
    heading: 'Начните с раздела:',
    caption: 'Бесплатный чек-лист для иностранных студентов. Нажмите на раздел — справочник откроется внутри Telegram. Сообщить об ошибке: /feedback.',
    fallbackText: 'Меню сейчас не загрузилось. Нажмите, чтобы открыть чек-лист:',
    feedbackPrompt: 'Ответьте на это сообщение и напишите ваш отзыв. Ответ будет переслан команде проекта с указанием отправителя средствами Telegram. Не отправляйте личные документы, пароли или платёжные данные.',
    feedbackSent: 'Спасибо — ваш отзыв отправлен.',
    feedbackFailed: 'Не удалось доставить отзыв. Попробуйте позже ещё раз ответить на сообщение с запросом отзыва.',
    feedbackUnavailable: 'Приём отзывов пока не настроен. Попробуйте позже.',
    chatId: 'ID вашего чата: {id}. Укажите его в FEEDBACK_CHAT_ID в Cloudflare, чтобы получать отзывы здесь.',
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
  if (!message || message.chat.type !== 'private' || message.from?.is_bot) return;
  const lang = pickLang(message.from && message.from.language_code);
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  const command = /^\/(start|help|feedback|chatid)(?:@[A-Za-z0-9_]+)?(?:\s|$)/.exec(text)?.[1];
  const recipient = String(env.FEEDBACK_CHAT_ID || '').trim();
  const configured = /^-?\d+$/.test(recipient);
  if (command === 'start' || command === 'help') {
    await sendMenu(env, message.chat.id, message.from && message.from.language_code);
  } else if (command === 'chatid') {
    // Setup helper: reveals only the ID of the sender's own private chat.
    await tgApi(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: TEXT[lang].chatId.replace('{id}', String(message.chat.id)),
    });
  } else if (command === 'feedback') {
    await tgApi(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: configured ? TEXT[lang].feedbackPrompt : TEXT[lang].feedbackUnavailable,
      ...(configured ? { reply_markup: { force_reply: true } } : {}),
    });
  } else if (!text.startsWith('/')) {
    const reply = message.reply_to_message;
    const isFeedbackPrompt = reply?.from?.is_bot &&
      Object.values(TEXT).some((translation) => reply.text === translation.feedbackPrompt);
    if (!isFeedbackPrompt) return;
    const botUsername = await getBotUsername(env);
    if (reply.from.username?.toLowerCase() !== botUsername.toLowerCase()) return;
    if (!configured) {
      await tgApi(env, 'sendMessage', { chat_id: message.chat.id, text: TEXT[lang].feedbackUnavailable });
      return;
    }
    try {
      await tgApi(env, 'forwardMessage', {
        chat_id: recipient,
        from_chat_id: message.chat.id,
        message_id: message.message_id,
      });
    } catch {
      await tgApi(env, 'sendMessage', { chat_id: message.chat.id, text: TEXT[lang].feedbackFailed });
      return;
    }
    await tgApi(env, 'sendMessage', { chat_id: message.chat.id, text: TEXT[lang].feedbackSent });
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