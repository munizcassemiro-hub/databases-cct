import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
// Load the actual curriculum without duplicating or changing its answer data.
const loader = await createServer({
  configFile: false,
  cacheDir: '.cache/curriculum-loader',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  logLevel: 'error',
});
let exercises, variation, lessons, normalCases, topicInfo, sqlTasks;
try {
  ({ exercises, variation } = await loader.ssrLoadModule('/src/exercises.ts'));
  ({ lessons, normalCases, topicInfo } = await loader.ssrLoadModule('/src/content.ts'));
  ({ sqlTasks } = await loader.ssrLoadModule('/src/sql.ts'));
} finally { await loader.close(); }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
page.on('pageerror', error => errors.push(error.message));
const key = 'database-lab.progress.v1';
const readProgress = () => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function route(path) {
  await page.goto(`${base}/#${path}`);
  try { await page.locator('h1').waitFor(); }
  catch (error) { throw new Error(`Could not open ${path}; browser errors: ${errors.join('; ')}`, { cause: error }); }
}
async function success() {
  await page.locator('.feedback.success').waitFor({ timeout: 5000 });
}

async function solve(ex, activePage = page) {
  const card = activePage.locator('.exercise-card');
  if (ex.type === 'choice') {
    for (const option of ex.correct) await card.locator('.choice').nth(ex.options.indexOf(option)).click();
  } else if (ex.type === 'key') {
    for (const column of ex.candidates[0]) await card.getByRole('button', { name: column, exact: true }).click();
  } else if (ex.type === 'assign') {
    for (const [i, value] of Object.values(ex.assignments).entries()) await card.locator('.assignments select').nth(i).selectOption(value);
  } else if (ex.type === 'atomic') {
    await card.locator('textarea').fill(ex.expectedLines.join('\n'));
  } else if (ex.type === 'reason') {
    await card.locator('textarea').fill(ex.explanation);
  } else if (ex.type === 'sql') {
    await card.getByRole('textbox', { name: 'Editor SQL' }).fill((ex.sqlTask ?? sqlTasks.find(task => task.id === ex.sqlId)).model);
  } else if (ex.type === 'workshop') {
    const data = normalCases.find(c => c.id === ex.caseId);
    const tables = ex.stage === 2 ? data.second : data.third;
    for (const [i, expected] of tables.entries()) {
      const table = card.locator('.builder-table').nth(i);
      await table.getByRole('textbox', { name: `Nome da tabela ${i + 1}`, exact: true }).fill(expected.name);
      for (const column of expected.columns) await table.getByRole('button', { name: column, exact: true }).click();
      for (const column of expected.pk) {
        await table.locator('.column-rules').filter({ has: activePage.locator('code').filter({ hasText: new RegExp(`^${escapeRegex(column)}$`) }) }).getByRole('checkbox').check();
      }
      for (const [column, reference] of Object.entries(expected.fk)) {
        await table.getByRole('textbox', { name: `FK de ${expected.name}.${column}`, exact: true }).fill(reference);
      }
    }
    await card.getByRole('textbox', { name: 'Your reason in English' }).fill(ex.stage === 2 ? data.reason2 : data.reason3);
    await card.getByRole('button', { name: 'Verificar minha montagem' }).click();
    return;
  } else throw new Error(`Unhandled exercise type: ${ex.type}`);
  await card.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
}

try {
  const proxied = await fetch(base, { headers: { Host: 'reading-week.external-preview.example.com' } });
  assert.equal(proxied.status, 200, 'A dynamically assigned preview hostname must be accepted');
  assert.match(await proxied.text(), /id="root"/);
  console.log('PASS: externally assigned preview hostname returns the application, not HTTP 403');

  for (const lesson of lessons) {
    await route(`${topicInfo[lesson.topic].page}/${lesson.id}`);
    assert.equal(await page.locator('.lesson-card h2').innerText(), lesson.title);
    assert.ok((await page.locator('.lesson-text').innerText()).length > 80);
    await page.getByRole('button', { name: 'Me explica de outro jeito' }).click();
    assert.equal(await page.locator('.alternative').innerText(), lesson.alternative);
    await page.getByRole('button', { name: 'Entendi esta lição' }).click();
    await page.getByRole('button', { name: 'Salvar lição', exact: true }).click();
  }
  assert.equal((await readProgress()).completed.length, lessons.length);
  assert.equal((await readProgress()).bookmarks.length, lessons.length);
  console.log(`PASS: all ${lessons.length} lessons, alternate explanations, completion and bookmarks`);

  for (const ex of exercises) {
    await route(`${topicInfo[ex.topic].page}/${ex.id}`);
    assert.equal(await page.locator('.exercise-heading h2').innerText(), ex.title);
    assert.equal(await page.locator('.model-answer').count(), 0, `Answers must start hidden: ${ex.id}`);
    if (!await page.locator('.exercise-card .translation').count()) {
      await page.locator('.exercise-card').getByRole('button', { name: /Mostrar tradução/ }).click();
    }
    assert.equal(await page.locator('.exercise-card .translation').innerText(), ex.translation);
    if (ex.type === 'sql') {
      await page.getByRole('textbox', { name: 'Editor SQL' }).fill('SELECT wrong_column FROM wrong_table;');
      await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
      await page.locator('.feedback.needs-work').waitFor();
    }
    await solve(ex);
    await success();
    await page.waitForFunction(({ storageKey, id }) => JSON.parse(localStorage.getItem(storageKey)).attempts[id]?.correct === true, { storageKey: key, id: ex.id });
    if ((exercises.indexOf(ex) + 1) % 10 === 0) console.log(`Verified ${exercises.indexOf(ex) + 1}/${exercises.length} exercises`);
  }
  const passed = await readProgress();
  assert.equal(Object.keys(passed.attempts).length, exercises.length);
  assert.ok(Object.values(passed.attempts).every(attempt => attempt.correct));
  await page.reload(); await page.locator('h1').waitFor();
  assert.deepEqual((await readProgress()).attempts, passed.attempts);
  await route('home');
  assert.equal(await page.locator('.stat-card').nth(0).locator('strong').innerText(), '100%');
  await route('review');
  assert.equal(await page.locator('.bookmark-card').count(), lessons.length);
  console.log(`PASS: all ${exercises.length} exercises through the real UI, including all SQL editors and all table builders; 100% progress persists after reload`);

  // Vary each of the 24 SQL tasks through the same error-review UI.
  for (const ex of exercises.filter(item => item.type === 'sql')) {
    const expected = variation(ex);
    await route(`${topicInfo.sql.page}/${ex.id}`);
    await page.getByRole('textbox', { name: 'Editor SQL' }).fill('SELECT wrong_column FROM wrong_table;');
    await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
    await page.locator('.feedback.needs-work').waitFor();
    await route('mistakes');
    assert.equal(await page.locator('.exercise-heading h2').innerText(), expected.title);
    await solve(expected);
    await success();
    assert.equal((await readProgress()).attempts[ex.id].correct, true);
  }
  console.log('PASS: all 24 SQL mistake variations resolve and update the original topic progress');

  // Sandboxed/private previews can deny the property getter, reads or writes.
  for (const failure of ['getter', 'read', 'write', 'corrupt']) {
    const restricted = await browser.newPage();
    restricted.on('pageerror', error => errors.push(error.message));
    await restricted.addInitScript(({ failure, key }) => {
      if (failure !== 'corrupt') {
        const storage = window.localStorage;
        const originalRead = Storage.prototype.getItem;
        const saved = JSON.stringify({ version: 1, completed: ['essentials'], bookmarks: ['primary'], attempts: {}, lastPage: 'learn' });
        storage.setItem(key, saved);
        window.__preservedProgressTest = { expected: saved, read: () => originalRead.call(storage, key) };
      }
      if (failure === 'getter') Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
      if (failure === 'read') Storage.prototype.getItem = () => { throw new DOMException('Read blocked', 'SecurityError'); };
      if (failure === 'write') Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
      if (failure === 'corrupt') localStorage.setItem(key, '{invalid json');
    }, { failure, key });
    await restricted.goto(`${base}/#keys/k01`);
    await restricted.getByRole('heading', { name: 'Key Detective · identidade' }).waitFor();
    await solve(exercises.find(ex => ex.id === 'k01'), restricted);
    await restricted.locator('.feedback.success').waitFor();
    if (failure !== 'corrupt') {
      await restricted.getByRole('alert').filter({ hasText: 'armazenamento' }).waitFor();
      assert.ok(await restricted.evaluate(() => window.__preservedProgressTest.read() === window.__preservedProgressTest.expected), `Existing progress must not be overwritten during a ${failure} failure`);
    }
    await restricted.close();
  }
  console.log('PASS: blocked storage getter, blocked reads, quota/write failure and corrupt storage do not crash the app; in-memory exercises still work');
  assert.deepEqual(errors, [], 'No unhandled errors across the whole curriculum or restricted storage scenarios');
} finally { await browser.close(); }
