import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../bot/worker.js';

const env = { BOT_TOKEN: 'test-token', WEBHOOK_SECRET: 'test-secret', FEEDBACK_CHAT_ID: '777' };
const bot = { id: 900, is_bot: true, username: 'test_bot' };

function telegram(t) {
  const calls = [];
  const sent = [];
  let failForward = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const method = String(url).split('/').pop();
    const body = JSON.parse(options.body);
    calls.push({ method, body });
    let result = true;
    if (method === 'getMe') result = bot;
    if (method === 'sendMessage') {
      result = { message_id: sent.length + 1, from: bot, chat: { id: body.chat_id, type: 'private' }, text: body.text };
      sent.push({ ...result, reply_markup: body.reply_markup });
    }
    const response = method === 'forwardMessage' && failForward
      ? { ok: false, description: 'Cannot deliver' } : { ok: true, result };
    return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
  });
  return { calls, sent, rejectDelivery: () => { failForward = true; } };
}

function message(text, extra = {}, language = 'en') {
  return { message_id: 100, chat: { id: 42, type: 'private' },
    from: { id: 42, is_bot: false, language_code: language }, text, ...extra };
}

function send(message, settings = env, secret = env.WEBHOOK_SECRET) {
  const request = new Request('https://worker.example/webhook', { method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ message }) });
  return worker.fetch(request, settings);
}

test('unauthorized webhook requests cannot deliver feedback', async (t) => {
  const api = telegram(t);
  assert.equal((await send(message('/feedback'), env, 'wrong')).status, 403);
  assert.deepEqual(api.calls, []);
});

test('feedback requires an explicit reply to this bot, not unrelated messages or other bots', async (t) => {
  const api = telegram(t);
  await send(message('/feedback'));
  const prompt = api.sent[0];
  assert.equal(prompt.reply_markup.force_reply, true);
  await send(message('Ordinary conversation'));
  await send(message('Not feedback', { reply_to_message: { ...prompt, from: { ...bot, username: 'other_bot' } } }));
  await send(message('Not feedback', { reply_to_message: { ...prompt, from: { id: 123, is_bot: false } } }));
  await send(message('/feedbacktypo'));
  assert.equal(api.calls.filter((call) => call.method === 'forwardMessage').length, 0);
  assert.equal(api.sent.length, 1);
});

test('prompt replies go only to the configured recipient and delivery is acknowledged afterwards', async (t) => {
  const api = telegram(t);
  for (const language of ['en', 'ru']) {
    await send(message('/feedback', {}, language));
    const prompt = api.sent[api.sent.length - 1];
    assert.equal(prompt.reply_markup.force_reply, true);
    const before = api.calls.length;
    await send(message('The registration section needs an update', { reply_to_message: prompt }, language));
    const delivery = api.calls.slice(before).filter((call) => call.method !== 'getMe');
    assert.deepEqual(delivery.map((call) => call.method), ['forwardMessage', 'sendMessage']);
    assert.equal(delivery[0].body.chat_id, '777');
    assert.equal(delivery[0].body.from_chat_id, 42);
    assert.equal(delivery[1].body.chat_id, 42);
  }
});

test('failed forwarding is not reported as successful delivery', async (t) => {
  const api = telegram(t);
  await send(message('/feedback'));
  const prompt = api.sent[0];
  await send(message('First feedback', { reply_to_message: prompt }));
  const success = api.sent[api.sent.length - 1].text;
  api.rejectDelivery();
  await send(message('Second feedback', { reply_to_message: prompt }));
  assert.notEqual(api.sent[api.sent.length - 1].text, success);
  assert.equal(api.sent.length, 3); // prompt, successful delivery acknowledgement, failure notice
});

test('an unconfigured recipient does not invite feedback into a dead end', async (t) => {
  const api = telegram(t);
  await send(message('/feedback'), { ...env, FEEDBACK_CHAT_ID: '' });
  assert.equal(api.sent[0].reply_markup, undefined);
  assert.equal(api.calls.filter((call) => call.method === 'forwardMessage').length, 0);
});
