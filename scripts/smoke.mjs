import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const channel = process.env.BROWSER_CHANNEL || 'chrome';
const url = process.env.SMOKE_URL || 'http://127.0.0.1:5173';
const production = process.env.SMOKE_PRODUCTION === '1';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
const checks = [];
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('canvas').waitFor();
  await page.screenshot({ path: `artifacts/${channel}-title.png`, fullPage: true });
  await page.getByRole('button', { name: 'Answer the call' }).click();
  await page.getByText('Bathroom · Connected', { exact: true }).waitFor();
  assert.equal(await page.locator('canvas').count(), 1);
  await page.screenshot({ path: `artifacts/${channel}-selfie.png`, fullPage: true });
  checks.push('Title, start lifecycle, WebGL canvas, selfie camera');
  if (!production) {
    await page.getByLabel('Action', { exact: true }).selectOption('switch_camera');
    await page.getByRole('button', { name: 'Queue action' }).click();
    await page.getByText('REAR CAMERA', { exact: false }).waitFor();
    await page.screenshot({ path: `artifacts/${channel}-rear.png`, fullPage: true });
    await page.getByLabel('Simulation speed').selectOption('10');
    for (const preset of ['valve', 'wrench', 'patch']) {
      await page.getByLabel('Scripted scenario').selectOption(preset);
      await page.getByRole('button', { name: 'Run preset' }).click();
      await page.getByRole('heading', { name: 'You saved the day.' }).waitFor({ timeout: 25000 });
      await page.screenshot({ path: `artifacts/${channel}-${preset}-win.png`, fullPage: true });
      checks.push(`${preset} solution through developer controls/public controller`);
    }
    await page.getByLabel('Scripted scenario').selectOption('flood');
    await page.getByRole('button', { name: 'Run preset' }).click();
    await page.getByRole('heading', { name: 'A little too much water.' }).waitFor({ timeout: 40000 });
    checks.push('Flood loss and terminal UI');
    await page.screenshot({ path: `artifacts/${channel}-flood.png`, fullPage: true });
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Answer the call' }).click();
    await page.getByRole('button', { name: 'Pause call', exact: true }).click();
    await page.getByRole('heading', { name: 'Call paused.' }).waitFor();
    await page.getByRole('button', { name: 'Resume call' }).click();
    await page.getByRole('tab', { name: 'state', exact: true }).click();
    await page.getByRole('img', { name: 'Developer room map' }).waitFor();
    checks.push('Reset, pause/resume, developer state/map');
  } else {
    assert.equal(await page.getByRole('complementary', { name: 'Developer panel' }).count(), 0);
    for (const file of await readdir('dist/assets')) if (file.endsWith('.js')) {
      const code = await readFile(`dist/assets/${file}`, 'utf8');
      assert.ok(!code.includes('Developer console'), 'Developer panel leaked into production bundle');
      assert.ok(!code.includes('SCENARIO PRESETS'), 'Presets leaked into production bundle');
    }
    checks.push('Production UI and bundle exclude developer controls and presets');
  }
  const timing = await page.evaluate(() => new Promise(resolve => {
    const deltas = []; let last = performance.now();
    function frame(now) { deltas.push(now - last); last = now; if (deltas.length < 120) requestAnimationFrame(frame); else { const sorted = deltas.slice(5).sort((a,b) => a-b); resolve({ medianFrameMs: sorted[Math.floor(sorted.length / 2)], p95FrameMs: sorted[Math.floor(sorted.length * .95)] }); } }
    requestAnimationFrame(frame);
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `artifacts/${channel}-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal page overflow');
  assert.deepEqual(errors, [], 'Browser errors');
  const report = { channel, browserVersion: browser.version(), url, production, checks, timing, errors };
  await writeFile(`artifacts/${channel}${production ? '-production' : ''}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
