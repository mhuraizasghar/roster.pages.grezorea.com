# Roster Use Cases and Working Structure

## Project Purpose

- Roster lets an instructor create timed multiple-choice quizzes for enrolled students.
- Students take quizzes, see their scores, review answers and compare high scores.
- Admins manage quiz content and enrollment, review submissions, and export or back up data.
- The current project is a browser-based prototype with Cloudflare Pages Functions and D1 used for cross-device quiz, attempt and score data.

## Actors

- **Student:** signs in using a name and an enrolled email address; takes available quizzes and reviews their own submissions.
- **Admin / instructor:** manages quiz content and enrollment, publishes quizzes, and reviews all submitted results.
- **Application:** validates inputs, tracks quiz state, scores attempts, stores records and renders dashboards.
- **Cloudflare Pages Functions and D1:** share quiz data, attempts and scores across devices when configured and available.
- **Static host / Git repository:** serves the site and published quiz bundle.

## Student Use Cases

1. **Sign in**
   - Student enters a name and email on the student page.
   - The app checks whether the email matches at least one exact email or allowed domain.
   - On success, the student dashboard and eligible quizzes appear.
   - Current limit: this checks an entered email only; it does not prove ownership of that email.

2. **Browse available quizzes**
   - Student sees quizzes for which their email is enrolled.
   - Each quiz shows its subject, question count, duration, pass mark and attempt usage.
   - A quiz with a reached attempt limit is disabled; an in-progress quiz can be resumed.

3. **Start or resume a quiz**
   - Student opens a quiz and sees its instructions, duration and pass mark.
   - The app checks enrollment and attempt limits before allowing the attempt.
   - Question order may be shuffled. Answers, current position and deadline are saved in browser storage.
   - Refreshing the page resumes the same attempt while its saved state remains available in that browser.

4. **Answer and submit**
   - Student selects options, navigates between questions and can clear an answer.
   - The countdown uses a saved absolute deadline, not just a decrementing counter.
   - The student confirms submission, or the timer automatically submits when time expires.
   - Unanswered questions are recorded as skipped.

5. **View and review a result**
   - Student sees score, percentage, pass status, time and counts of correct, incorrect and skipped answers.
   - The review shows each question, selected answer, correct answer and optional explanation.
   - The student can filter the review and see the quiz high-score table.
   - A result is intended to be visible to its student and to the admin.

6. **View prior attempts**
   - The dashboard lists recent attempts for the signed-in email.
   - The student can open a prior attempt review and compare the leaderboard for a quiz.

## Admin / Instructor Use Cases

1. **Sign in to the admin panel**
   - Admin opens `admin.html` and enters the admin password.
   - The admin guide opens from the help button in the navigation bar.
   - The guide describes quiz creation, enrollment, publishing, results and backup actions.
   - Current limit: the password and login state are stored client-side; this is not secure server authentication.

2. **Create and edit quizzes**
   - Admin creates a quiz and sets its title, subject, description, duration, pass mark, shuffle option and maximum attempts.
   - Admin adds multiple-choice questions, two to six answer options, selects the correct option and may add an explanation.
   - Admin reorders, edits or deletes questions, then validates and saves the quiz.

3. **Manage enrollment**
   - Admin adds exact student emails or a domain rule such as `@university.edu`.
   - The editor validates, deduplicates and reports invalid entries.
   - Admin saves the quiz with the enrollment list.

4. **Import and export quiz content**
   - Admin imports quiz JSON or exports one selected quiz as JSON.
   - Invalid imported quizzes are rejected with an error message.

5. **Publish quizzes to students**
   - Admin downloads `published.json` from Publish & settings.
   - Admin commits the file to the repository and publishes the site.
   - Students on other devices can then load the published quiz and enrollment data.
   - With the configured shared API, saving quizzes can also update the shared D1-backed quiz collection.

6. **Review student results**
   - Admin opens Results, filters by quiz, searches by student name or email, and reads summary statistics.
   - Admin clicks Review to inspect the submitted answer snapshot.
   - The Review action stays in the same browser tab so the tab-local admin session is preserved. Previously, it opened a new tab; that tab had no admin session and showed “This result is private.”
   - Admin can export the filtered result set as CSV.

7. **Back up and restore**
   - Admin exports a JSON backup containing quizzes, attempts and scores from the current browser.
   - Admin restores a backup after confirming that it will replace the browser's current data.

8. **Change password or reset demo quizzes**
   - Admin can change the password stored in the current browser.
   - Admin can restore the built-in demo quiz; this operation does not delete past results.

## Main Working Structure

- `index.html` and `js/index.js`: student sign-in, quiz catalogue, attempt history and leaderboard.
- `quiz.html` and `js/quiz.js`: enrollment check, attempt lifecycle, saved progress, timer, answer navigation and submission.
- `result.html` and `js/result.js`: owner/admin access check, score summary, answer review and leaderboard.
- `admin.html` and `js/admin.js`: admin sign-in, quiz editor, enrollment, result review, CSV export and settings.
- `js/store.js`: client-side data access, normalization, validation, scoring, local persistence, shared API synchronization and backups.
- `js/common.js`: shared rendering and browser utility functions.
- `data/questions.js`: built-in demo quiz.
- `data/published.json`: published quiz bundle consumed by the static app.
- `functions/api/quizzes.js`: shared quiz API backed by D1.
- `functions/api/attempts.js`: shared submitted-attempt API backed by D1.
- `functions/api/scores.js`: best-score and leaderboard API backed by D1.
- `migrations/`: D1 table definitions and indexes.
- `tests/store.test.js`: unit tests for storage, email rules, scoring, imports and backup behavior.

## Data and Request Flow

1. The browser loads page code and quiz data from the static host.
2. `Store.init()` loads browser data and the published quiz file, then tries to refresh shared quiz, attempt and score data from the Pages API.
3. The student controller validates enrollment and opens `quiz.html` with a quiz ID.
4. The quiz controller saves progress locally while the attempt is active.
5. On submit, the store creates an attempt snapshot and a best-score row, saves them locally and posts them to the shared API when reachable.
6. The result controller loads the selected attempt and permits review for the matching student email or an admin session.
7. The admin controller queries the available attempts, renders result rows and links to the answer review.

## Current Access and Reliability Limits

- Student and admin session records use browser `sessionStorage` and do not automatically move to another tab or device.
- The admin result-review link has been changed to remain in the authenticated tab; this resolves the reported private-result behavior when an admin opens Review from the panel.
- Student sign-in is an enrollment check, not account authentication. A person can enter another enrolled email.
- The admin password is stored in browser storage and admin checks happen in client-side code.
- Quiz questions, correct answers and enrollment rules are delivered to the browser. The current design is not suitable for high-stakes or confidential exams.
- Shared API routes currently accept requests without server-side user authentication. Treat the current application as a learning/demo system, not a protected student-records system.
- If the shared API is unavailable, the browser falls back to local data. Browser-local results do not automatically appear on another device until successfully synchronized.

## Proposed Production Use-Case Improvements

- Add real student and admin authentication, with students proving control of their email and roles enforced by the server.
- Enforce quiz enrollment, attempt limits and result ownership on the server, not only in browser JavaScript.
- Keep correct answers server-side while a quiz is in progress; score and submit attempts in a trusted server function.
- Apply database access policies so students can read only their own attempts, while admins can review all authorized submissions.
- Remove student email addresses from public leaderboard responses unless there is a clear operational need to expose them.
- Add audit records for quiz edits, enrollment changes, admin result views and exports.
- Add API contract tests for unauthorized access, enrollment checks, attempt limits, submission deadlines and result visibility.
