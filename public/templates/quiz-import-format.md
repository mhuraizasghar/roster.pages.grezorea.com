# Roster quiz import format

Use the JSON or CSV sample as a starter. Import from Teacher Workspace → Quiz Library. Imported quizzes are drafts; review each question and answer key before assigning or launching it.

## JSON

The file must contain a `quizzes` array. Each quiz needs a `title` and a `draftQuestions` array. A question can include:

- `type`: `mcq`, `tf`, `short_answer`, or `challenge`
- `prompt`: question text
- `options`: answer choices (not needed for short answer)
- `correctAnswer`: zero-based option index, `true`/`false`, or accepted answer text
- `acceptedAnswers`, `explanation`, `points`, and `timeLimitSec` (optional)

Keep the JSON valid: use double quotes, commas between fields, and escape quotation marks in text. Do not include student records, passwords, access tokens, or other private data in quiz files.

## CSV

Use one row per question with these headers:

`quiz_title,subject,question,type,option_a,option_b,option_c,option_d,correct_option,explanation`

For multiple choice and challenge questions, `correct_option` is `a`, `b`, `c`, or `d`; provide at least two options. For true/false, use `type=tf` and `correct_option=true` or `false`. For short answer, put the expected answer in `correct_option`. Quote fields containing commas or line breaks and double embedded quotes.

Rows with the same `quiz_title` become questions in one quiz. Use consistent title and subject values for those rows.

## AI authoring checklist

When asking an AI to create a quiz, request a JSON file that follows the included sample. Ask it to check that every question has one unambiguous correct answer, all option indexes are in range, question wording is self-contained, and explanations match the key. Import into a draft and review it before sharing with students.
