#!/usr/bin/env node
/*
 * Generates data/published.json from the seed quiz in data/questions.js.
 * Usage: node scripts/build-published.js
 *
 * In day-to-day use the admin panel's "Download published.json" button produces this file
 * from whatever quizzes you created. This script just bootstraps the first version.
 */
const fs = require('fs');
const path = require('path');

globalThis.window = globalThis;
require('../data/questions.js');

const bundle = { version: 1, generatedAt: new Date().toISOString(), quizzes: globalThis.SEED_QUIZZES };
const out = path.join(__dirname, '..', 'data', 'published.json');
fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n');
console.log(`Wrote ${out} with ${bundle.quizzes.length} quiz(zes).`);
