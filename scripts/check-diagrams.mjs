// Validate every ```mermaid block in the docs actually parses.
// A broken block renders as an error box on GitHub; this catches it first.
// Run: node scripts/check-diagrams.mjs

import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = ['README.md', ...readdirSync('docs').filter((f) => f.endsWith('.md')).map((f) => join('docs', f))];

const blocks = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlock = false;
  let start = 0;
  let buf = [];
  lines.forEach((line, i) => {
    if (!inBlock && line.trim() === '```mermaid') {
      inBlock = true;
      start = i + 1;
      buf = [];
    } else if (inBlock && line.trim() === '```') {
      inBlock = false;
      blocks.push({ file, line: start + 1, text: buf.join('\n') });
    } else if (inBlock) {
      buf.push(line);
    }
  });
}

if (blocks.length === 0) {
  console.log('no mermaid blocks found');
  process.exit(0);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js' });

let failures = 0;
for (const b of blocks) {
  const result = await page.evaluate(async (text) => {
    try {
      await window.mermaid.parse(text);
      return null;
    } catch (e) {
      return String(e.message || e);
    }
  }, b.text);
  const where = `${b.file}:${b.line}`;
  if (result) {
    failures++;
    console.log(`FAIL  ${where}\n      ${result.split('\n')[0]}`);
  } else {
    console.log(`ok    ${where}  (${b.text.trim().split('\n')[0]})`);
  }
}

await browser.close();
console.log(`\n${blocks.length - failures}/${blocks.length} diagrams parse`);
process.exit(failures ? 1 : 0);
