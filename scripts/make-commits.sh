#!/usr/bin/env bash
# Turns this finished project into a clean history of 13 logical commits.
# Run once from the project root, on a fresh folder (no existing .git).
#   bash scripts/make-commits.sh
set -euo pipefail

if [ -d .git ]; then
  echo "A .git folder already exists. Remove it or run this on a fresh copy." >&2
  exit 1
fi

git init -q -b main

commit() { # commit "message" file...
  local msg="$1"; shift
  git add -- "$@"
  git commit -q -m "$msg"
  echo "committed: $msg"
}

commit "chore: add .gitignore and package.json"                       .gitignore package.json
commit "docs: propose architecture for phases 1 and 2"                 ARCHITECTURE.md
commit "feat(data): add 20 computer-basics questions as a JS array"    data/questions.js
commit "feat(core): add storage layer with scoring, email rules, scores" js/store.js
commit "feat(ui): add shared helpers and Bootstrap theme"              js/common.js css/style.css
commit "feat(student): add email sign-in, quiz catalogue and history"  index.html js/index.js
commit "feat(quiz): add question flow, countdown timer, progress bar"  quiz.html js/quiz.js
commit "feat(result): add score, percentage, answer review, high scores" result.html js/result.js
commit "feat(admin): add quiz editor, enrolment list, results, backup" admin.html js/admin.js
commit "feat(publish): add published bundle and generator script"      scripts/build-published.js data/published.json
commit "test: add unit tests for store logic"                          tests/store.test.js
commit "ci: run syntax check and tests on every push"                  .github/workflows/ci.yml
commit "docs: add README with setup, deployment and limitations"       README.md scripts/make-commits.sh

git status --short
echo
echo "Done: $(git rev-list --count HEAD) commits. Next:"
echo "  git remote add origin https://github.com/<user>/<repo>.git && git push -u origin main"
