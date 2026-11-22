# QuizHub

QuizHub is a browser-based quiz application for taking timed multiple-choice quizzes, reviewing answers, and comparing scores. It also includes an admin area for creating quizzes, managing enrolled emails, viewing results, and importing or exporting quiz data.

## Repository

GitHub: https://github.com/mhuraizasghar/quiz

## Features

- Timed quizzes with automatic submission
- Student sign-in through an enrolled email list
- Randomized question order
- Score, percentage, answer review, and high-score results
- Admin quiz and question editor
- Student enrolment management
- Import and export of quiz data
- Browser storage for quizzes and student attempts

## Run locally

No build step or package installation is required.

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 in a browser.

### Demo login

Use a name and either `student@example.com` or `demo@example.com` for the student view.

Open `admin.html` to use the admin panel. The default admin password is `admin123`.

## Testing

Run the tests with Node.js:

```bash
node --test
```

The test suite covers quiz scoring, email rules, result tables, imports, backups, and stored quizzes.

## Project files

- `index.html` - student sign-in and dashboard
- `quiz.html` - quiz instructions and timed quiz runner
- `result.html` - score and answer review
- `admin.html` - quiz and student management
- `css/style.css` - application styles
- `js/` - page controllers and browser data storage
- `data/` - question and published quiz data
- `tests/` - automated tests
- `scripts/` - build and repository scripts

## Data storage

Quiz content and enrolment information are stored in `data/published.json` so they can be shared by publishing the file with the site.

Student sessions, attempts, and high scores are stored in the browser using `localStorage`. Results are not stored on a shared server in this version.

## Security note

The sign-in screens are intended for simple access control. They are not a secure exam system. Admin passwords and quiz answers are visible in browser-side code and data files, so this project should not be used for graded or high-stakes examinations without a backend authentication and scoring system.
