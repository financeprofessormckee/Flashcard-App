# Course Flashcards

A lightweight, static flashcard web app for reviewing course concepts. Built with
plain HTML, CSS, and JavaScript — **no frameworks, no build step, no backend, and no
accounts.** It runs as-is on GitHub Pages.

Students pick a course and a module, flip through cards, mark each one as **Knew it**
or **Needs review**, and their progress is saved automatically in their own browser.

Individual progress stays **local to the student's browser and is never sent anywhere** —
the instructor cannot see any student's results. The only data that leaves the browser is
**anonymous, cookieless, aggregate usage counting** (see [Usage analytics](#usage-analytics)),
which records totals — visits, module opens, card flips — with no IP retained and no
personal or identifying information.

## Features

- Course → module selection driven entirely by JSON files.
- Flip cards by clicking, with a dedicated **Flip** button.
- Next / Previous navigation (wraps around the deck).
- Mark cards **Knew it** / **Needs review** (mutually exclusive).
- **Shuffle** the current deck without losing progress.
- **Review missed** mode to study only the cards you flagged.
- **Reset module** to clear progress for the current module.
- Progress persists across visits via `localStorage`.
- **Dark mode** toggle (remembers your choice; defaults to your system setting).
- **Keyboard shortcuts:** `←` / `→` move, `Space` or `Enter` flips, `K` = Knew it,
  `J` = Needs review.
- Accessible: real buttons, labeled dropdowns, `aria-live` status, visible focus rings,
  mobile-friendly layout.

## Project structure

```
index.html      Markup and UI elements
styles.css      Styling, responsive layout, light/dark themes
app.js          All app logic and localStorage handling
data/
  courses.json          Registry: courses and, for each, its list of modules
  fin6300module1.json   One file per module (id, title, cards)
  econ101module1.json
  econ101module2.json
  ...
assets/
  images/       Optional images (currently empty)
prompts/
  Generate Module Flashcards (AI Prompt).docx   Shareable AI prompt for authoring cards
```

`courses.json` is the registry. Each course lists its modules, and each module
points to its own JSON file (loaded only when a student opens that module):

```json
[
  {
    "id": "fin6300",
    "title": "FIN 6300: Managerial Finance",
    "modules": [
      { "id": "module-1", "title": "Module 1: Introduction", "file": "fin6300module1.json" }
    ]
  }
]
```

Each module file is exactly what the AI prompt below produces:

```json
{
  "id": "module-1",
  "title": "Module 1: Introduction",
  "cards": [
    { "id": "m1-card-001", "front": "Your question here", "back": "Your answer here" }
  ]
}
```

## Editing content

All content lives in the `data/` folder. You do not need to touch the HTML, CSS, or JS
to add material.

### Add a course

Add a new object to the array in `data/courses.json` with an empty `modules` list:

```json
{
  "id": "econ303",
  "title": "Public Economics",
  "modules": []
}
```

The `id` must be unique and stable.

### Add a module

1. Create the module file in `data/`, e.g. `data/econ303module1.json`, with the shape
   `{ "id": "...", "title": "...", "cards": [ ... ] }` (this is exactly what the AI prompt
   below returns — usually you just save its output).
2. Register it under the course's `modules` array in `data/courses.json`:

   ```json
   { "id": "module-1", "title": "Module 1: Market Failure", "file": "econ303module1.json" }
   ```

Module `id`s must be unique within their course and should stay stable. The `file` is the
filename in `data/`.

### Add cards

Add objects to a module file's `cards` array:

```json
{ "id": "m1-card-008", "front": "Your question here", "back": "Your answer here" }
```

**Important:** every card needs a unique, stable `id`. Progress is tracked by card `id`,
not by position, so you can reorder cards later without erasing anyone's progress. Never
reuse an old `id` for different content.

### Generating cards from slides (AI prompt)

Writing cards by hand is the slow part. The `prompts/` folder contains a ready-to-share
Word document — **`Generate Module Flashcards (AI Prompt).docx`** — that turns a module's
lecture slides into the JSON a module needs. Any instructor can use it:

1. Open the document and fill in the two values at the top of the prompt — the
   course/topic name and the module number — for the module you're building. The AI
   derives the module ID, title, and card-ID prefix from those (e.g. *Managerial Finance*,
   module *1* → `module-1`, "Module 1: Managerial Finance", IDs `m1-card-001`, …).
2. Start a chat with an AI assistant (Claude, ChatGPT, etc.), **attach the module's slides**
   (PowerPoint or PDF), and paste in the prompt.
3. Save the JSON module object it returns as its own file in `data/` (e.g.
   `data/fin6300module2.json`), then register that file under the course's `modules` array
   in `data/courses.json` (see **Add a module** above).

The prompt is self-contained: it teaches the AI the exact schema, requires plain-text /
valid JSON output, and uses module-prefixed card IDs (`m1-card-001`, …) so blocks generated
separately never collide.

## How local progress works

Progress is stored only in the student's browser using `localStorage` — it is never sent
anywhere. Keys are versioned:

- Per-module progress: `flashcards:v1:{courseId}:{moduleId}`
  (stores known IDs, review IDs, last card index, and a timestamp).
- Last visited course/module: `flashcards:v1:lastSession`.
- Theme preference: `flashcards:v1:theme`.

Because data is per-browser, students on a different device or browser start fresh, and
the instructor cannot see any results.

## Usage analytics

To gauge how much the tool is used — without collecting any identifying information — the
app reports **anonymous, aggregate** usage counts via
[GoatCounter](https://www.goatcounter.com/), a free, open-source, **cookieless** analytics
service.

### What is and isn't collected

- **No cookies, no accounts, no fingerprinting.** Unique visitors are derived from a
  daily-rotating hash that GoatCounter discards; **no IP address is stored** and there is
  **no persistent identifier**.
- You (the instructor) only ever see **aggregate totals and charts** — never an individual
  student, and never anyone's card-by-card progress (that stays in their browser).
- Three things are counted, all aggregate:
  1. **Visits / unique visitors** — how many people opened the app (automatic pageview).
  2. **Module opens** — a `module-open/{courseId}/{moduleId}` event each time a module is
     opened, so you can see which content gets used.
  3. **Card flips** — a `flip` event each time a card is turned to its answer, as a proxy
     for how many flashcards get studied.

> Because counts are fully anonymous, non-identifiable, and aggregate, this is generally
> closer to program evaluation than human-subjects research. If you collect it for research,
> confirm the characterization with your IRB.

### Setup

1. Create a free account at [goatcounter.com](https://www.goatcounter.com/) and pick a site
   code (e.g. `wtflashcards`, giving you `wtflashcards.goatcounter.com`).
2. In `index.html`, replace `MYCODE` in the GoatCounter `<script>` tag with that code.
3. Deploy. Counts appear on your GoatCounter dashboard.

GoatCounter ignores `localhost` by default, so counts only register from the deployed site,
not local dev. The tracking code fails silently if the script is blocked (e.g. by an ad
blocker), so the app works the same with or without it.

## Run locally

JSON files are loaded with `fetch`, which browsers block over the `file://` protocol.
Run a small local server instead:

```bash
python3 -m http.server 8000
```

Then open:

```
http://localhost:8000
```

(Opening `index.html` directly via `file://` will cause the course list to fail to load.)

## Deploy to GitHub Pages

1. Push this folder's contents to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose your
   branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
4. Wait a moment, then visit the published URL GitHub provides.

No build step or dependencies are required — GitHub Pages serves the files as-is.
