import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWidgetHTML, pickLang } from '../bot/worker.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realCategories = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'content/categories.json'), 'utf8'),
).categories;

const BOT = 'tgappcheck_bot';

test('the real categories build a widget in both languages', () => {
  for (const lang of ['en', 'ru']) {
    const html = buildWidgetHTML(realCategories, lang, BOT);
    for (const category of realCategories) {
      assert.ok(html.includes(category.title[lang]), `${lang}: missing title ${category.id}`);
      assert.ok(
        html.includes(`startapp=cat-${category.id}'`),
        `${lang}: missing deep link for ${category.id}`,
      );
      assert.ok(
        html.includes(`https://t.me/${BOT}?startapp=cat-${category.id}`),
        `${lang}: wrong bot in deep link`,
      );
    }
    assert.ok(html.includes('TelegramWidget.openTelegramLink'));
    assert.ok(html.includes('<button'), `${lang}: no buttons`);
  }
});

test('the widget fits Telegram size limits with the real content', () => {
  for (const lang of ['en', 'ru']) {
    const html = buildWidgetHTML(realCategories, lang, BOT);
    const size = Buffer.byteLength(html, 'utf8');
    const compressed = zlib.gzipSync(html, { level: 9 }).length;
    assert.ok(size >= 1 && size <= 32768, `size ${size}`);
    assert.ok(compressed <= 4096, `compressed ${compressed}`);
    console.log(`${lang}: ${size} bytes, ${compressed} compressed`);
  }
});

test('category text is HTML-escaped, links stay intact', () => {
  const categories = [
    {
      id: 'quotes',
      title: { en: 'A "quoted" & <tagged> section', ru: 'Раздел «с кавычками»' },
      description: { en: "Don't <lose> this", ru: 'Описание' },
    },
  ];
  const html = buildWidgetHTML(categories, 'en', BOT);
  assert.ok(!html.includes('<tagged>'));
  assert.ok(!html.includes("<lose>"));
  assert.ok(html.includes('A &quot;quoted&quot; &amp; &lt;tagged&gt; section'));
  assert.ok(html.includes(`https://t.me/${BOT}?startapp=cat-quotes`));
  // Description missing in one language renders without the description.
  const htmlNoDesc = buildWidgetHTML(
    [{ id: 'bare', title: { en: 'Bare', ru: 'Голый' } }],
    'en',
    BOT,
  );
  assert.ok(htmlNoDesc.includes('Bare') && !htmlNoDesc.includes('class="d"'));
});

test('categories with broken ids are skipped, not linked', () => {
  const html = buildWidgetHTML(
    [
      { id: 'fine-1', title: { en: 'Fine', ru: 'Ок' } },
      { id: 'Not Fine', title: { en: 'Bad', ru: 'Плохо' } },
      { id: '', title: { en: 'Empty', ru: 'Пусто' } },
    ],
    'en',
    BOT,
  );
  assert.ok(html.includes('cat-fine-1'));
  assert.ok(!html.includes('cat-Not') && !html.includes('Bad') && !html.includes('Empty'));
});
test('an invalid bot username is refused, not sent to users', () => {
  assert.throws(() => buildWidgetHTML(realCategories, 'en', 'bad bot name!'), /Invalid bot username/);
});

test('language detection follows the Telegram language code', () => {
  assert.equal(pickLang('ru'), 'ru');
  assert.equal(pickLang('ru-RU'), 'ru');
  assert.equal(pickLang('en'), 'en');
  assert.equal(pickLang('de'), 'en');
  assert.equal(pickLang(undefined), 'en');
  assert.equal(pickLang(null), 'en');
});