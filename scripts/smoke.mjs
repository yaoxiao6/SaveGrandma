import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const channel = process.env.BROWSER_CHANNEL || 'chrome';
const url = process.env.SMOKE_URL || 'http://127.0.0.1:5173';
const production = process.env.SMOKE_PRODUCTION === '1';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// Voice needs a microphone and OPENAI_API_KEY, neither of which the smoke environment has.
page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[voice]')) errors.push(m.text()); });
page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
const checks = [];
const RULE = 'Stop the water before the room floods.';
const tell = async text => { const input = page.getByLabel('Tell Grandma what to do'); await input.fill(text); await input.press('Enter'); };
const connected = () => page.getByPlaceholder('Tell Grandma…').waitFor({ timeout: 40000 });
try {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the splash button wiggles forever otherwise
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor();
  await page.screenshot({ path: `artifacts/${channel}-title.png` });
  await page.getByRole('button', { name: 'Start the game' }).click();
  await page.getByRole('dialog', { name: 'Incoming call from Granny' }).waitFor();
  await page.screenshot({ path: `artifacts/${channel}-incoming.png` });
  await page.getByRole('button', { name: 'Answer the call' }).click();
  await connected(); // Granny greets and the rules show before the call goes live
  await page.getByText('Objectives', { exact: true }).waitFor();
  assert.equal(await page.locator('canvas').count(), 1);
  const phone = await page.getByTestId('phone').boundingBox();
  assert.ok(Math.abs(phone.width / phone.height - 9 / 16) < 0.01, `Phone frame is not 9:16 (${phone.width}x${phone.height})`);
  await page.screenshot({ path: `artifacts/${channel}-rear.png` });
  checks.push('Title, start lifecycle, WebGL canvas, rear camera on the flooding room, 9:16 frame');
  await tell('switch to the front camera');
  await page.getByText('switch camera completed.', { exact: false }).waitFor();
  await page.screenshot({ path: `artifacts/${channel}-selfie.png` });
  await tell('switch to the rear camera');
  await page.getByText('switch camera completed.', { exact: false }).nth(1).waitFor();
  checks.push('Typed instruction switches camera');
  await tell('go to the wrench, pick up the wrench, walk to the pipe, bend down, tighten the joint');
  await page.getByRole('heading', { name: 'You saved the day.' }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: `artifacts/${channel}-wrench-win.png` });
  checks.push('Wrench solution typed through the command session');
  await page.getByRole('button', { name: 'Start a new call' }).click();
  await connected();
  await tell('go to the valve, turn the valve');
  await page.getByText('clockwise or counterclockwise', { exact: false }).waitFor({ timeout: 20000 });
  checks.push('Clarification result shown in transcript');
  await page.getByText('Objectives', { exact: true }).click();
  await page.getByText(RULE, { exact: true }).waitFor();
  await page.screenshot({ path: `artifacts/${channel}-objectives.png` });
  await page.getByText('Objectives', { exact: true }).click();
  checks.push('Restart, objectives toggle');
  const timing = await page.evaluate(() => new Promise(resolve => {
    const deltas = []; let last = performance.now();
    function frame(now) { deltas.push(now - last); last = now; if (deltas.length < 120) requestAnimationFrame(frame); else { const sorted = deltas.slice(5).sort((a,b) => a-b); resolve({ medianFrameMs: sorted[Math.floor(sorted.length / 2)], p95FrameMs: sorted[Math.floor(sorted.length * .95)] }); } }
    requestAnimationFrame(frame);
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `artifacts/${channel}-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal page overflow');
  assert.deepEqual(errors, [], 'Browser errors');
  const report = { channel, browserVersion: browser.version(), url, production, checks, timing, errors };
  await writeFile(`artifacts/${channel}${production ? '-production' : ''}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
