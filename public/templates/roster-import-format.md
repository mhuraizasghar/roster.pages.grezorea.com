# Roster student import format

Open Teacher Workspace → Student Roster and upload a CSV or JSON file. Download the sample CSV or JSON from the roster panel and replace its example rows. Imports add students to the currently signed-in teacher's roster.

## CSV

Use one student per row with the header `email,name,group`. Names and group are optional. Quote a cell if it contains a comma, line break, or quotation mark; write an embedded quote twice.

## JSON

Use either a top-level array or an object with a `students` array. Each item accepts `email` (or `studentEmail`), `name` (or `displayName`), and `group` (or `groupName`). Example:

```json
{
  "students": [
    { "email": "student@example.edu", "name": "Student Name", "group": "Section A" }
  ]
}
```

Use student email addresses only. Do not upload passwords, sign-in codes, access tokens, or unrelated personal information. Invalid addresses are skipped and reported.
