# Checklist for students in China (Telegram Mini App)

A free Telegram Mini App for foreign students who are about to arrive, or have just arrived, in Shanghai. It shows a short, ordered list of steps, in English and Russian (choose a language using the globe and language code at the top right). Students can track completion on their device without accounts or uploading personal information.

Site: `https://0xpsix.github.io/TGAPPcheck/`. Confirm the exact address in your repo → Settings → Pages after the first deploy.

## Choose a language

Tap the borderless globe/language button beside the title to open the language picker. It lists languages by their native names and marks the selected one. Choosing an option closes the menu and saves your preference. Tap outside or press Escape to dismiss it without changing languages.

Keyboard support: Enter/Space opens the picker; arrow keys, Home and End move through options; Enter/Space selects; Escape returns focus to the button. Tab closes the menu and continues to the next control. The button uses a keyboard-only underline instead of a focus outline.

The menu is generated from `LANGS` in `js/validate.js`, with native labels in `LANGUAGE_NAMES` in `js/app.js`. Adding another language still requires its UI/content translations and language-detection support; no additional header buttons or HTML options are needed.

## Track progress

Use the checkbox beside a step to mark it complete; uncheck it to undo. Checking does not open or close the step text. Each category shows its completed count on the home card and inside the category. Completed steps remain readable and in their original order.

The home screen also shows one combined progress bar with a count under it, for example "6 of 15 steps completed", once every category has loaded. The bar fills from left to right in the accent color of the active design. A card of a partly completed category shows "Resume at step N"; it opens that category and goes straight to the first unfinished step (the step opens and the app scrolls to it). A finished category shows "Completed ✓" on its card and inside the category. The deep link for one step is `#/c/<category id>/<step id>`; the app only scrolls to a step that exists.

A single **Continue** action above the cards opens the first unfinished step across all categories, using category order and then step order from JSON. It says **Start checklist** before any steps are completed, disappears when everything is done, and stays hidden if any category cannot load so it never guesses the wrong next step.

Progress is saved in the browser or Telegram webview's `localStorage`, under `checklist.progress.v1`. It contains only category/step ID pairs. Closing and reopening on the same device and browser/webview normally keeps it; it does not sync across devices or between a browser and Telegram. Clearing webview/site data or moving to another hosting domain can erase or separate saved progress.

If storage is blocked or saving fails, the app shows a warning and tracks completion only in memory until it is closed or reloaded. Unreadable saved data is left untouched and also triggers the warning.

The app also saves each content file it loads in the browser's Cache Storage. If a load then fails (no network or VPN), the app uses the saved copy instead of showing an error. So screens you have opened before keep working when you tap Try again or open the app again, as long as the page itself can load. A saved copy is replaced on every successful load, so it is up to date whenever you were online recently.

**Keep IDs stable:** reordering steps or editing their texts does not reset completion. Renaming a step ID or moving it to another category treats it as a new step. Renaming a category ID also separates its saved progress. Newly added IDs start incomplete, and removed steps do not inflate the counts. If an old ID is reused or restored, its old completion can reappear, so use a new ID for a genuinely new task.

## Edit steps

Step text and category descriptions live in the `content/` folder. You never need to touch the app code to change them. The home-screen introduction and other interface text live in `js/i18n.js`.

- `content/categories.json`: the sections on the home screen, in display order.
- `content/steps/<category id>.json`: the steps of one section, in display order. The app numbers them 1, 2, 3… for you.

### Fields

| Field | Where | Required | Rule |
|---|---|---|---|
| `categories` | top of categories.json | yes | a list with at least one category; list order = home-screen order |
| `steps` | top of a steps file | yes | a list with at least one step; list order = on-screen order |
| `id` | category, step | yes | lowercase letters, digits and single hyphens, e.g. `bank-card`; unique within the file; never shown to students. A category's steps file is `content/steps/<its id>.json` |
| `title` | category, step | yes | `{"en": "…", "ru": "…"}`, both filled in |
| `description` | category | no | same shape as `title`; shown below the category title on its home-screen card |
| `summary` | step | no | same shape as `title`; one short line under the title |
| `details` | step | no | `{"en": ["…", "…"], "ru": ["…"]}`, opens when the student taps the step. Each text is a paragraph; a text starting with `- ` is a bullet point. A non-bullet text ending in `:` starts a section heading |
| `links` | step | no | a list of `{"label": {"en": "…", "ru": "…"}, "url": "https://…"}`; the url must start with `https://` or `http://` |
| `phrases` | step | no | list of `{"meaning": {"en": "…", "ru": "…"}, "zh": "…", "pinyin": "…"}`; shown in a collapsed Chinese-phrases section |

Any other field name is reported as a mistake, so typos like `tittle` are caught. Texts are plain text: no HTML, no Markdown. Translated fields need both `en` and `ru`; a phrase's `zh` and `pinyin` are single texts. If you don't need an optional field, delete it entirely.

Copy a step from `content/steps/first-steps.json` as a starting point. Give it a new unique `id` and replace its English and Russian texts.

### JSON rules to remember

- Every text goes in straight double quotes: `"like this"`.
- Put a comma between items, but never after the last item in a list or object.
- A `"` inside a text must be written `\"`. Typographic quotes « » and “ ” are fine as they are.
- You cannot press Enter inside a text. For a new paragraph, add a new item to the `details` list instead.

### Detail sections

Put `"What to bring:"` in the English details and `"Что взять с собой:"` in the Russian details to start a bordered document-list section. `"Important:"` and `"Важно:"` start an accent-highlighted notes section. Keep the colon.

Following paragraphs and bullets belong to that section until the next non-bullet line ending in `:` (or the end of the details). Other such lines become ordinary section headings. These styles work in both light and dark mode; no new step fields are needed.

### Chinese phrases

Open a step, then expand **Useful Chinese phrases** to see the Chinese, pinyin and its English/Russian meaning. **Copy Chinese** copies only the Chinese sentence. If copying is unavailable, select the Chinese text and copy it manually.

To add a phrase, put a `phrases` list alongside the step's `title`, `summary` and `details`, for example:

```json
"phrases": [
  {
    "meaning": { "en": "I need to see a doctor.", "ru": "Мне нужно к врачу." },
    "zh": "我需要看医生。",
    "pinyin": "Wǒ xūyào kàn yīshēng."
  }
]
```

Keep a comma between this field and the preceding or following field. `meaning`, `zh` and `pinyin` must be filled in; an omitted or empty `phrases` list shows no extra section.

### Edit on github.com

1. Open the file (e.g. `content/steps/first-steps.json`) and click the pencil icon ("Edit").
2. Change the text, click "Commit changes…", and commit directly to `main`.
3. Open the **Actions** tab of the repo:
   - **Green ✓**: the change is live a few minutes after the run finishes; reopen the app. Because of caching it can occasionally take up to about 10 more minutes.
   - **Red ✗**: nothing changed for students; they still see the previous version. Open the failed run, then the step "Check content". It lists the file, the step and the problem, e.g. `content/steps/first-steps.json: step 2 (id "sim-card"): "title.ru" must be non-empty text`. JSON syntax mistakes include the line and column. Fix the file and commit again.

### Add a step

Copy a whole step block, from its `{` to its matching `}`, and paste it where the new step should appear. Put a comma between the blocks (but not after the last one), give it a new unique `id`, and write the English and Russian texts.

### Add a category

1. Add `{ "id": "<new-id>", "title": { "en": "…", "ru": "…" } }` to the list in `content/categories.json`. Its position sets its place on the home screen.
2. Create `content/steps/<new-id>.json`, for example by copying `first-steps.json`, and write its steps.
3. Optionally add `"description": {"en": "…", "ru": "…"}` beside the category's `title` to give its home-screen card a short description. Both languages are required if you include it.

A steps file that is not listed in `categories.json` is a hidden draft. The check only warns about it, and the app does not show it.

## Preview and check locally

Run these in the project folder:

```sh
npm run validate                                   # check content/ (same check as on GitHub)
npm test                                           # run the automatic tests
python3 -m http.server 8000 --bind 127.0.0.1       # preview at http://127.0.0.1:8000/  (Ctrl+C to stop)
```

The preview server listens only on your own computer (`127.0.0.1`). Stop it with Ctrl+C when you are done.

### Light and dark theme

The sun/moon switch sits immediately left of the language picker, aligned with the title. Sun is light mode; moon is dark mode. Both use the same red design. Switching changes colours without resetting the current screen, expanded steps or completion.

Before a manual choice, the app follows Telegram's light/dark setting (or the system theme in a normal browser), including changes while open. Your manual choice is saved as `checklist.theme` in localStorage and overrides automatic changes after reopening. When storage is blocked, the choice lasts only for the current session. The switch has an English/Russian screen-reader label and works with Enter or Space.

## One-time setup

### 1. Publish on GitHub Pages

1. On github.com create a new repository named `TGAPPcheck`. Make it **Public**, and do **not** add a README, .gitignore or license: the repo must be empty.
2. In the repo: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. In the project folder run:
   ```sh
   git remote add origin https://github.com/0xPsix/TGAPPcheck.git
   git push -u origin main
   ```
4. Open the Actions tab. The run "Check content and deploy" should turn green, and Settings → Pages then shows the site address.

If something goes wrong:
- **"Setup Pages" fails, or you could not choose "GitHub Actions" before the first push:** set the Source now, then go to Actions → "Check content and deploy" → "Run workflow".
- **The push is rejected with a message about `workflow` scope:** your token needs the `workflow` scope (classic token) or "Workflows: Read and write" (fine-grained token). Alternatively, push with GitHub Desktop.

### 2. Connect to Telegram

1. In Telegram open @BotFather, send `/newbot`, and choose a name and a username ending in `bot`. BotFather then shows a **token**:
   - keep it private (for example in a password manager);
   - this app never needs it, so never put it in this repo or send it to anyone.
2. Set the Main Mini App: @BotFather → `/mybots` → your bot → Bot Settings → Configure Mini App → Enable Mini App → send the site address **with** the trailing slash. Button names in BotFather may differ slightly.
3. Optional:
   - `/setmenubutton`: the same address, with a button text such as "Checklist".
   - `/setdescription`: a short text shown in the empty bot chat, e.g. "Tap Open to see the checklist".
4. Open `https://t.me/<your_bot_username>?startapp` on your phone. The app should open.

### 3. Bot backend (Cloudflare Worker)

`bot/worker.js` is a small always-on function that replies to `/start` with a **menu widget** (Bot API 10.4): an interactive category menu drawn inside the message bubble, in the user's language, built fresh from the live `content/categories.json` on every `/start`. Each button opens the Mini App straight at that section. If the widget cannot be built, the bot sends a plain fallback message, so `/start` is never silent.

One-time setup (about 10 minutes, no command line):

1. Create a free account at dash.cloudflare.com → **Workers & Pages** → **Create** → **Worker** → name it (e.g. `tgappcheck-bot`) → **Edit code** → paste the whole `bot/worker.js` → **Deploy**. Note the address: `https://tgappcheck-bot.<your-subdomain>.workers.dev`.
2. In the Worker: **Settings → Variables** → add:
   - `BOT_TOKEN` — type **Secret** — the token from @BotFather (`/token` if you lost it);
   - `WEBHOOK_SECRET` — type **Secret** — any long random string (run `openssl rand -hex 16` in the project folder and paste the output);
   - `MAIN_APP_URL` — type **Text** — the site address from Settings → Pages, e.g. `https://0xpsix.github.io/TGAPPcheck`.
3. Open `https://<worker-address>/register` in a browser once. It should show `true` — that told Telegram where to deliver updates.
4. In Telegram send `/start` to the bot. The menu widget appears; its buttons open the Mini App.

Notes:
- The token lives only in Cloudflare as an encrypted secret, never in this repo.
- Widget code is frozen per message: after editing categories on github.com, old widgets keep the old menu; a new `/start` sends a fresh one.
- Test the widget on a phone: widgets work only in the private chat with the bot and cannot be forwarded.
- If you change `WEBHOOK_SECRET` later, open `/register` again.

### 4. Receive feedback in Telegram

Feedback is handled in the bot, not in the Mini App. `/feedback` sends a reply prompt that explains the reply will be forwarded to the project team with Telegram's sender attribution. Only replies to that prompt are forwarded; ordinary messages are not collected. The bot acknowledges successful delivery, or reports delivery/configuration failure. There is no separate database; the forwarded messages live in the recipient's Telegram chat.

For an existing Worker:

1. In Cloudflare, replace its code with the updated `bot/worker.js` and deploy.
2. In your own private chat with the bot, send `/chatid`. Copy the ID it returns.
3. Worker → Settings → Variables and Secrets: add **`FEEDBACK_CHAT_ID`**, type **Text**, with that ID. Save and deploy. Do not change `BOT_TOKEN`, `WEBHOOK_SECRET` or `MAIN_APP_URL`.
4. Send `/feedback`, then **reply to the bot's prompt**. Confirm that you receive a forwarded copy and an acknowledgement. Messages or attachments with Telegram's forwarding protection cannot be delivered; the bot reports failure.
5. For discoverability, use @BotFather → `/setcommands` and set:
   ```text
   start - Open the checklist
   help - Show the checklist menu
   feedback - Report an issue or suggest an improvement
   ```

`/chatid` is only a setup helper and returns the requesting user's own private-chat ID. You don't need to publish it in the command menu. Updating code and adding `FEEDBACK_CHAT_ID` does not require registering the webhook again.

## Files

```
index.html                      app header with title, sun/moon switch and language picker
css/app.css                     shared red design with light and dark palettes
js/app.js                       screens, navigation, loading content
js/i18n.js                      interface texts (EN/RU) and language choice
js/validate.js                  content rules (used by the app and by the check)
js/progress.js                  local completion storage, keyed by category and step ID
content/categories.json         home-screen sections
content/steps/first-steps.json  steps of "First Steps"
scripts/validate-content.js     the content check (npm run validate)
tests/content.test.js           automatic tests (npm test)
tests/progress.test.js          persistence, ID stability and storage-failure tests
tests/feedback.test.js          feedback consent, webhook authorization and delivery-failure tests
.github/workflows/deploy.yml    on every push: check → test → publish
bot/worker.js                   Cloudflare Worker: /start menu widget (token stays in Cloudflare)
```

There are no secrets in this repo, and the app never needs the bot token. Never commit `.env` files or tokens: the repo is public.

### Markdown content sources

`mds/checklist_ru.md` and `mds/preparation_ru.md` are Russian drafting sources; the app reads only the JSON files in `content/steps/`. Editing Markdown does not update the app automatically.

Missing entries were transferred into JSON with English translations; the existing English example text has since been translated from its Russian counterpart. Russian step text, IDs and order remain unchanged. Markdown subsection labels are detail lines ending in `:`, which the app displays as section headings. Unfinished `[Подробнее](#)` links and future-category planning notes were not imported.

This transfer does not verify the legal, financial or travel claims in the drafts. Review their accuracy before publishing.
