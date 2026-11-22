# QuizHub: Online Quiz Application

A responsive, browser-based quiz platform built with **HTML5, CSS3, Bootstrap 5 and vanilla JavaScript**. Students sign in with an enrolled email, take a timed multiple-choice quiz one question at a time, and get a score, a percentage and a full answer review. Admins create and edit quizzes and manage the list of student emails that may attempt each one.

**Live site:** `https://<your-username>.github.io/<your-repo>/` (see [Deploy](#deploy-to-github-pages))

## Features

| Area | What it does |
| --- | --- |
| Quiz content | 20 multiple-choice questions on *Computer Basics*, stored in a JavaScript array (`data/questions.js`) |
| Question flow | One question at a time; select, change or clear an answer; Previous / Next; numbered question navigator |
| Timer | 10-minute countdown (configurable per quiz), turns amber then red, **auto-submits at zero**. Survives page refresh |
| Progress | Bootstrap progress bar showing how many questions are answered |
| Results | Score, percentage, pass/fail, time taken, and a review of every question showing the **chosen** and the **correct** answer, with filters (all / correct / incorrect / skipped) |
| Advanced | Questions are **randomised** every attempt; **high-score table** per quiz in `localStorage` (best result per student, top 10) |
| Authentication | Students must use an email on the quiz's enrolment list (exact emails or whole domains such as `@university.edu`) |
| Admin panel | Create, edit, duplicate, delete and import/export quizzes; question editor; enrolment list with validation and `.txt/.csv` import; results table with CSV export; backup/restore |
| UI | Google Sans (with a DM Sans fallback), Font Awesome icons, Bootstrap 5.3 layout, keyboard shortcuts, accessible markup, print-friendly result page |

## Quick start

No build step and no dependencies for the app itself.

```bash
# any static server works; opening index.html directly also works
python3 -m http.server 8000
# then visit http://localhost:8000
```

Demo accounts:

| Role | Credentials |
| --- | --- |
| Student | any name + `student@example.com` (or `demo@example.com`) |
| Admin (`admin.html`) | password `admin123` (change it under *Publish & settings*) |

## How it works across devices

GitHub Pages hosts static files only, so there is no server to hold shared data. QuizHub handles this honestly in two parts:

1. **Quizzes and enrolment lists are shared** through `data/published.json`. The admin builds quizzes in the admin panel, clicks **Download published.json**, and commits that file to the repository. Every student device loads it on startup, so quizzes and allowed emails appear everywhere after the site redeploys.
2. **Attempts, results and high scores are stored per browser** (`localStorage`), as the project brief specifies. The admin sees results from the browser they are using. Use *Export backup* to move data between computers.

Truly central results across devices need a backend. [ARCHITECTURE.md](ARCHITECTURE.md) describes that production phase (Firebase or Supabase) and why `js/store.js` is the only file that would change.

## Question format

```js
{
  id: 'cb01',
  text: 'Which component is considered the "brain" of the computer?',
  options: ['Monitor', 'CPU', 'Keyboard', 'Power supply'],
  correct: 1,                 // 0-based index into options
  explanation: 'The CPU executes instructions…'   // optional, shown in the review
}
```

Admins can also import a whole quiz as JSON from the admin panel (same shape as `data/published.json` entries).

## Project structure

```
index.html        student sign-in, quiz list, attempts, high scores
quiz.html         instructions + quiz runner (timer, progress, navigator)
result.html       score, percentage, answer review, leaderboard
admin.html        admin panel
css/style.css     theme on top of Bootstrap
js/store.js       data layer: the only module that touches storage (+ pure scoring logic)
js/common.js      shared UI helpers (escape, toast, confirm dialog, downloads)
js/index.js  js/quiz.js  js/result.js  js/admin.js   one controller per page
data/questions.js seed quiz (JavaScript array)
data/published.json  quiz bundle loaded on every device
tests/store.test.js  unit tests (Node's built-in test runner)
scripts/          build-published.js, make-commits.sh
```

## Testing

```bash
node --test          # 15 unit tests for scoring, e-mail rules, leaderboard, import, backup
```

Requires Node 18+ (tested on Node 22). The same command runs in GitHub Actions on every push (`.github/workflows/ci.yml`).

## Deploy to GitHub Pages

1. Create a new repository on GitHub and push this folder (see the next section).
2. In the repository open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select branch `main` and folder `/ (root)`, then **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/<your-repo>/`.

Publishing quiz changes later: download `published.json` from the admin panel, replace `data/published.json`, commit and push.

## Git workflow

Commit messages follow *type(scope): summary* (`feat(quiz): add countdown timer`). To import this finished project as a clean sequence of logical commits:

```bash
bash scripts/make-commits.sh
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

The script groups the existing files into 13 commits. For your own further work, commit as you go: small, focused commits are what graders and teammates want to read.

## Limitations (read before real exams)

* Admin and student "sign in" run in the browser. They stop casual access but are **not secure**: anyone with the site files can read the quiz answers and the enrolment list in `published.json`. Do not use this version for graded exams.
* Results are per browser (see above).
* Google Sans is loaded from Google Fonts when available and falls back to DM Sans.

The production roadmap in [ARCHITECTURE.md](ARCHITECTURE.md) fixes all three.

## Where the course concepts appear

| Concept | Where |
| --- | --- |
| Arrays | question bank (`data/questions.js`), answers map, `order` array of shuffled question ids |
| Loops | `map`/`forEach` rendering of options, navigator, review, tables; Fisher-Yates shuffle loop in `Store.shuffle` |
| Functions | small single-purpose functions in every file (`buildAttempt`, `parseEmails`, `render`, `tick`, `submit`) |
| DOM and events | one controller per page, event delegation on lists |
| localStorage | quizzes, attempts, high scores, in-progress state (`js/store.js`) |
