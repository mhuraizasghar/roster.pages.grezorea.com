/**
 * Roster Grading, Email Normalization, Bulk Roster Parsing & Answer Protection
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmail(raw) {
  return EMAIL_RE.test(normalizeEmail(raw));
}

/**
 * Parse single/bulk pasted emails or CSV (supports optional "email,name,group" columns).
 */
export function parseBulkRoster(input, existingEmails = new Set()) {
  const text = String(input ?? '').trim();
  if (!text) {
    return { validEntries: [], duplicates: [], invalid: [] };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set(Array.from(existingEmails, (e) => normalizeEmail(e)));
  const validEntries = [];
  const duplicates = [];
  const invalid = [];

  // Detect CSV header row
  let startIdx = 0;
  let colMap = { email: 0, name: 1, group: 2 };
  const firstCols = lines[0].split(',').map((c) => c.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  if (firstCols.some((c) => c === 'email' || c === 'e-mail' || c === 'student_email')) {
    startIdx = 1;
    colMap = {
      email: firstCols.findIndex((c) => c === 'email' || c === 'e-mail' || c === 'student_email'),
      name: firstCols.findIndex((c) => c === 'name' || c === 'display_name' || c === 'student_name'),
      group: firstCols.findIndex((c) => c === 'group' || c === 'section' || c === 'class'),
    };
  }

  const looksLikeCsv = startIdx === 1 || lines.some((l) => l.includes(','));

  if (looksLikeCsv && lines.length > 0) {
    for (let i = startIdx; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (!cols.length) continue;
      // If no header and single line with multiple comma-separated emails (e.g. "a@x.com, b@y.com")
      if (startIdx === 0 && cols.every((c) => c.includes('@') || !c.includes(' '))) {
        const allLookLikeEmails = cols.filter(Boolean).every((c) => isValidEmail(c));
        if (allLookLikeEmails && cols.length > 1) {
          for (const rawCell of cols) {
            pushCandidate(rawCell, '', '', seen, validEntries, duplicates, invalid);
          }
          continue;
        }
      }
      const rawEmail = cols[colMap.email] ?? '';
      const rawName = colMap.name >= 0 ? (cols[colMap.name] ?? '') : '';
      const rawGroup = colMap.group >= 0 ? (cols[colMap.group] ?? '') : '';
      pushCandidate(rawEmail, rawName, rawGroup, seen, validEntries, duplicates, invalid);
    }
  } else {
    // Whitespace / semicolon separated list
    const tokens = text.split(/[\s,;]+/).filter(Boolean);
    for (const token of tokens) {
      pushCandidate(token, '', '', seen, validEntries, duplicates, invalid);
    }
  }

  return { validEntries, duplicates, invalid };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function pushCandidate(rawEmail, rawName, rawGroup, seen, validEntries, duplicates, invalid) {
  const cleaned = String(rawEmail ?? '').trim().replace(/^[<"'*]+|[>"']+$/g, '');
  if (!cleaned) return;
  const norm = normalizeEmail(cleaned);
  if (!EMAIL_RE.test(norm)) {
    invalid.push(cleaned);
    return;
  }
  if (seen.has(norm)) {
    duplicates.push(norm);
    return;
  }
  seen.add(norm);
  validEntries.push({
    email: norm,
    displayName: String(rawName ?? '').trim().slice(0, 80),
    groupName: String(rawGroup ?? '').trim().slice(0, 60),
  });
}

/**
 * Levenshtein edit distance for forgiving short-answer spelling tolerance.
 */
export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  const curr = new Array(t.length + 1);
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j];
  }
  return prev[t.length];
}

export function matchShortAnswer(response, acceptedAnswers = [], matchOptions = {}) {
  const raw = String(response ?? '').trim();
  if (!raw) return false;

  const {
    caseSensitive = false,
    ignoreSpaces = true,
    allowMinorSpelling = true,
  } = matchOptions || {};

  const normalize = (val) => {
    let s = String(val ?? '').trim();
    if (!caseSensitive) s = s.toLowerCase();
    if (ignoreSpaces) s = s.replace(/\s+/g, '');
    else s = s.replace(/\s+/g, ' ');
    return s;
  };

  const candidate = normalize(raw);
  if (!candidate) return false;

  for (const ans of acceptedAnswers) {
    const target = normalize(ans);
    if (!target) continue;
    if (candidate === target) return true;
    if (allowMinorSpelling) {
      const maxEdits = target.length >= 8 ? 2 : target.length >= 4 ? 1 : 0;
      if (maxEdits > 0 && levenshtein(candidate, target) <= maxEdits) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Grade a single question (supports mcq single/multi, tf, short_answer, challenge).
 */
export function gradeQuestion(question, response, { elapsedSec = null } = {}) {
  const points = Math.max(1, Number(question.points || 1));

  if (response === undefined || response === null || response === '' || (Array.isArray(response) && response.length === 0)) {
    return { isCorrect: false, awardedPoints: 0 };
  }

  if (question.type === 'tf') {
    const normalizeBool = (v) => {
      if (v === true || v === 'true' || v === 0 || v === '0' || String(v).toLowerCase() === 'true') return 'true';
      if (v === false || v === 'false' || v === 1 || v === '1' || String(v).toLowerCase() === 'false') return 'false';
      return String(v);
    };
    const ok = normalizeBool(response) === normalizeBool(question.correctAnswer);
    return { isCorrect: ok, awardedPoints: ok ? points : 0 };
  }

  if (question.type === 'mcq') {
    const expected = Array.isArray(question.correctAnswer)
      ? question.correctAnswer.map(Number).sort((a, b) => a - b)
      : [Number(question.correctAnswer)];
    const given = Array.isArray(response)
      ? Array.from(new Set(response.map(Number))).sort((a, b) => a - b)
      : [Number(response)];

    const ok = expected.length === given.length && expected.every((val, idx) => val === given[idx]);
    return { isCorrect: ok, awardedPoints: ok ? points : 0 };
  }

  if (question.type === 'challenge') {
    const expected = Number(question.correctAnswer);
    const given = Number(response);
    const ok = Number.isInteger(given) && given === expected;
    if (!ok) return { isCorrect: false, awardedPoints: 0 };

    // Speed bonus: up to +50% of base points based on remaining time
    const limit = Math.max(5, Number(question.timeLimitSec || 20));
    const elapsed = elapsedSec == null ? limit : Math.max(0, Math.min(limit, Number(elapsedSec)));
    const remainingRatio = Math.max(0, (limit - elapsed) / limit);
    const speedBonus = Math.round(points * 0.5 * remainingRatio);
    return { isCorrect: true, awardedPoints: points + speedBonus };
  }

  if (question.type === 'short_answer') {
    const accepted = Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length
      ? question.acceptedAnswers
      : (question.correctAnswer != null ? [String(question.correctAnswer)] : []);
    const ok = matchShortAnswer(response, accepted, question.matchOptions);
    return { isCorrect: ok, awardedPoints: ok ? points : 0 };
  }

  return { isCorrect: false, awardedPoints: 0 };
}

export function recalculateAttemptScore(questions, answers) {
  const maxScore = questions.reduce((sum, q) => sum + Math.max(1, Number(q.points || 1)), 0);
  const score = answers.reduce((sum, a) => sum + Number(a.awardedPoints || 0), 0);
  const percent = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 1000) / 10) : 0;
  return { score, maxScore, percent };
}

/**
 * Strip sensitive answer keys before sending questions to a student browser.
 */
export function sanitizeQuestionForStudent(q, revealAnswers = false) {
  const base = {
    id: q.id,
    position: q.position,
    type: q.type,
    prompt: q.prompt,
    options: Array.isArray(q.options) ? q.options : [],
    multiSelect: Array.isArray(q.correctAnswer) && q.correctAnswer.length > 1,
    points: Math.max(1, Number(q.points || 1)),
    timeLimitSec: Number(q.timeLimitSec || 20),
    imageUrl: q.imageUrl || '',
  };
  if (revealAnswers) {
    base.correctAnswer = q.correctAnswer;
    base.acceptedAnswers = q.acceptedAnswers || [];
    base.explanation = q.explanation || '';
  }
  return base;
}

export function csvCell(value) {
  const s = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCsvReport(headers, rows) {
  const head = headers.map(csvCell).join(',');
  const body = rows.map((row) => row.map(csvCell).join(','));
  return [head, ...body].join('\n');
}
