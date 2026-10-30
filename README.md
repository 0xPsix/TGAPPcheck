# Checklist for students in China (Telegram Mini App)

A free Telegram Mini App for foreign students who are about to arrive, or have just arrived, in Shanghai. It shows a short, ordered list of steps, in English and Russian (switch with the EN / RU buttons). It is a read-only guide: no accounts and no personal data.

Site: `https://0xpsix.github.io/TGAPPcheck/`. Confirm the exact address in your repo → Settings → Pages after the first deploy.

## Edit steps

All texts students see live in the `content/` folder. You never need to touch the app code to change them.

- `content/categories.json`: the sections on the home screen, in display order.
- `content/steps/<category id>.json`: the steps of one section, in display order. The app numbers them 1, 2, 3… for you.

### Fields

| Field | Where | Required | Rule |
|---|---|---|---|
| `categories` | top of categories.json | yes | a list with at least one category; list order = home-screen order |
| `steps` | top of a steps file | yes | a list with at least one step; list order = on-screen order |
| `id` | category, step | yes | lowercase letters, digits and single hyphens, e.g. `bank-card`; unique within the file; never shown to students. A category's steps file is `content/steps/<its id>.json` |
| `title` | category, step | yes | `{"en": "…", "ru": "…"}`, both filled in |
| `summary` | step | no | same shape as `title`; one short line under the title |
| `details` | step | no | `{"en": ["…", "…"], "ru": ["…"]}`, opens when the student taps the step. Each text is a paragraph; a text starting with `- ` (dash and space) is a bullet point, and bullets in a row form one list |
| `links` | step | no | a list of `{"label": {"en": "…", "ru": "…"}, "url": "https://…"}`; the url must start with `https://` or `http://` |

Any other field name is reported as a mistake, so typos like `tittle` are caught. Texts are plain text: no HTML, no Markdown. Every text needs both `en` and `ru`. If you don't need an optional field, delete it entirely.

`content/steps/first-steps.json` contains one example step marked `[PLACEHOLDER]`. Copy it to see the format, then replace it with real steps.

### JSON rules to remember

- Every text goes in straight double quotes: `"like this"`.
- Put a comma between items, but never after the last item in a list or object.
- A `"` inside a text must be written `\"`. Typographic quotes « » and “ ” are fine as they are.
- You cannot press Enter inside a text. For a new paragraph, add a new item to the `details` list instead.

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

A steps file that is not listed in `categories.json` is a hidden draft. The check only warns about it, and the app does not show it.

## Preview and check locally

Run these in the project folder:

```sh
npm run validate                                   # check content/ (same check as on GitHub)
npm test                                           # run the automatic tests
python3 -m http.server 8000 --bind 127.0.0.1       # preview at http://127.0.0.1:8000/  (Ctrl+C to stop)
```

The preview server listens only on your own computer (`127.0.0.1`). Stop it with Ctrl+C when you are done.

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

## Files

```
index.html                      app page: header with title and EN/RU switch
css/app.css                     styles; colors follow the Telegram theme
js/app.js                       screens, navigation, loading content
js/i18n.js                      interface texts (EN/RU) and language choice
js/validate.js                  content rules (used by the app and by the check)
content/categories.json         home-screen sections
content/steps/first-steps.json  steps of "First Steps"
scripts/validate-content.js     the content check (npm run validate)
tests/content.test.js           automatic tests (npm test)
.github/workflows/deploy.yml    on every push: check → test → publish
```

There are no secrets in this repo, and the app never needs the bot token. Never commit `.env` files or tokens: the repo is public.

### Markdown content sources

`mds/checklist_ru.md` and `mds/preparation_ru.md` are Russian drafting sources; the app reads only the JSON files in `content/steps/`. Editing Markdown does not update the app automatically.

Missing entries were transferred into JSON with English translations, leaving previously entered steps unchanged. Markdown subsection labels become plain-text detail lines; unfinished `[Подробнее](#)` links and future-category planning notes are not published as new links or steps.

This transfer does not verify the legal, financial or travel claims in the drafts. Review their accuracy before publishing.
