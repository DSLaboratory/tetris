// Capture real gameplay screenshots into docs/screenshots/.
// Serves the production build, drives the game with synthetic key events,
// and screenshots the canvas. Run: node scripts/screenshots.mjs

import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4173 } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.goto('http://localhost:4173/');

const canvas = page.locator('#game');
const sleep = (ms) => page.waitForTimeout(ms);

async function tap(key, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await sleep(60);
  }
}

// Hold the soft-drop key briefly, with a lateral nudge first, so pieces
// land quickly and build a believable mid-game stack.
async function playPiece(softKey, lateralKey, nudges) {
  await tap(lateralKey, nudges);
  if (Math.random() < 0.7) await tap('x');
  await page.keyboard.down(softKey);
  await sleep(700);
  await page.keyboard.up(softKey);
  await sleep(250); // release across lock + ARE so the next piece is not slammed
}

// --- menu ---
await sleep(500);
await canvas.screenshot({ path: `${OUT}/menu.png` });

// --- classic mode, level 5 ---
await page.keyboard.press('5');
await tap('Enter');
await sleep(300);
for (let i = 0; i < 14; i++) {
  const left = i % 2 === 0;
  await playPiece('ArrowDown', left ? 'ArrowLeft' : 'ArrowRight', (i % 5) + 1);
}
await sleep(400); // settle mid-fall of the next piece
await canvas.screenshot({ path: `${OUT}/classic.png` });

// --- horizontal mode, level 5 ---
await page.reload();
await sleep(400);
await tap('ArrowUp'); // toggle mode to horizontal
await page.keyboard.press('5');
await tap('Enter');
await sleep(300);
for (let i = 0; i < 16; i++) {
  // One of the two soft-drop keys is always dead, so press both in turn;
  // the live one drops the piece toward its wall.
  await tap(i % 2 === 0 ? 'ArrowUp' : 'ArrowDown', (i % 4) + 1);
  if (Math.random() < 0.7) await tap('z');
  for (const key of ['ArrowLeft', 'ArrowRight']) {
    await page.keyboard.down(key);
    await sleep(450);
    await page.keyboard.up(key);
    await sleep(120);
  }
  await sleep(200);
}
await sleep(400);
await canvas.screenshot({ path: `${OUT}/horizontal.png` });

await browser.close();
await server.close();
console.log(`written: ${OUT}/menu.png, classic.png, horizontal.png`);
process.exit(0);
