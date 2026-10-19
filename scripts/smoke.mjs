import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const remoteRequests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', req => { if (!req.url().startsWith(base) && !req.url().startsWith('data:')) remoteRequests.push(req.url()); });
await mkdir('test-results', { recursive: true });
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('database-lab.progress.v1')));
async function route(hash) { await page.goto(`${base}/#${hash}`); await page.locator('h1').waitFor(); }
async function feedback(text) { await page.getByRole('status').filter({ hasText: text }).waitFor(); }
async function checkNoOverflow() { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal page overflow at ${page.url()}`); }

try {
  await route('home');
  assert.match(await page.locator('h1').innerText(), /vamos aprender/);
  await page.getByRole('button', { name: /Começar do zero/ }).click();
  await page.getByRole('heading', { name: 'Primeiros passos', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Entendi esta lição' }).click();
  await page.getByRole('button', { name: 'Salvar lição', exact: true }).click();
  assert.ok((await data()).completed.includes('essentials'));
  assert.ok((await data()).bookmarks.includes('essentials'));
  await route('keys/k03');
  assert.equal(await page.locator('.model-answer').count(), 0, 'Model solution must stay hidden initially');
  await page.getByRole('button', { name: 'Lecturer_no', exact: true }).click();
  await page.getByRole('button', { name: 'Course_code', exact: true }).click();
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('Há colisão');
  assert.equal(await page.locator('.collision-row').count(), 2);
  assert.equal((await data()).attempts.k03.correct, false);
  await page.getByRole('button', { name: 'Start_date', exact: true }).click();
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('Boa!');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('não mínima');
  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('Boa!');
  await page.reload(); await page.locator('h1').waitFor();
  assert.equal((await data()).attempts.k03.correct, true);
  assert.ok((await data()).bookmarks.includes('essentials'));
  console.log('PASS: actual key collisions, minimality, completion, bookmarks and refresh persistence');

  await route('sql/s10');
  await page.getByRole('textbox', { name: 'Editor SQL' }).fill("UPDATE students SET city = 'Cork';");
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('Faltou WHERE');
  await route('mistakes');
  assert.match(await page.locator('.exercise-heading').innerText(), /variação/);
  assert.match(await page.locator('.exercise-prompt').innerText(), /Galway/);
  await page.getByRole('textbox', { name: 'Editor SQL' }).fill("update students set city='Galway' where student_id=1");
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('Boa!');
  assert.equal((await data()).attempts.s10.correct, true);
  await route('sql/s12');
  await page.getByRole('textbox', { name: 'Editor SQL' }).fill("SELECT first_name, city FROM students WHERE city = 'Dublin';");
  await page.getByRole('button', { name: 'Verificar resposta', exact: true }).click();
  await feedback('Boa!');
  assert.equal(await page.locator('.feedback tbody tr').count(), 2);
  await page.screenshot({ path: 'test-results/sql-desktop.png', fullPage: true });
  console.log('PASS: targeted SQL feedback, new mistake variation and SELECT preview');

  await route('normalisation/n-lecturer-2');
  await page.getByRole('button', { name: 'Verificar minha montagem' }).click();
  await feedback('Falta uma tabela');
  const target = [
    { name: 'LECTURER', columns: ['Lecturer_no', 'Name', 'Faculty', 'Office_loc'], pk: ['Lecturer_no'], fk: {} },
    { name: 'COURSE', columns: ['Course_code', 'Course_name'], pk: ['Course_code'], fk: {} },
    { name: 'TEACHING', columns: ['Lecturer_no', 'Course_code', 'Start_date', 'Weekly_time'], pk: ['Lecturer_no', 'Course_code', 'Start_date'], fk: { Lecturer_no: 'LECTURER.Lecturer_no', Course_code: 'COURSE.Course_code' } },
  ];
  for (let i = 0; i < target.length; i++) {
    const expected = target[i]; const table = page.locator('.builder-table').nth(i);
    await page.getByRole('textbox', { name: `Nome da tabela ${i + 1}`, exact: true }).fill(expected.name);
    for (const column of expected.columns) await table.getByRole('button', { name: column, exact: true }).click();
    for (const column of expected.pk) await table.locator('.column-rules').filter({ has: page.locator('code').filter({ hasText: new RegExp(`^${column}$`) }) }).getByRole('checkbox').check();
    for (const [column, ref] of Object.entries(expected.fk)) await page.getByRole('textbox', { name: `FK de ${expected.name}.${column}`, exact: true }).fill(ref);
  }
  await page.getByRole('textbox', { name: 'Your reason in English' }).fill('Remove partial dependencies: lecturer details depend on Lecturer_no and Course_name depends on Course_code; Weekly_time depends on the full key.');
  await page.getByRole('button', { name: 'Verificar minha montagem' }).click();
  await feedback('Tabelas, colunas, PKs e FKs conferem');
  assert.equal((await data()).attempts['n-lecturer-2'].correct, true);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'FK de TEACHING.Course_code', exact: true }).inputValue(), '');
  await page.locator('.case-explorer summary').click();
  await page.getByRole('button', { name: '3NF', exact: true }).click();
  assert.match(await page.locator('.success-note').innerText(), /2NF já é 3NF/);
  await page.screenshot({ path: 'test-results/normalisation-desktop.png', fullPage: true });
  console.log('PASS: full table assembly, PK/FK marking, reason, undo and lecturer 2NF=3NF');

  await page.locator('.glossary-button').click();
  await page.getByRole('textbox', { name: 'Buscar termo no glossário' }).fill('Foreign');
  await page.getByRole('button', { name: /Foreign Key chave estrangeira/ }).click();
  assert.match(await page.locator('.glossary-term p').innerText(), /Referência/);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await route('review');
  assert.ok(await page.getByRole('button', { name: 'Uma tabela, várias ideias', exact: false }).count());
  await route('home');
  await page.getByRole('button', { name: 'Redefinir progresso' }).click();
  await page.getByRole('button', { name: 'Manter meu progresso' }).click();
  assert.ok((await data()).completed.length);
  console.log('PASS: searchable glossary, keyboard close, saved bookmarks and reset cancellation');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await checkNoOverflow();
  assert.equal(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().right <= 1), true);
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.locator('.sidebar').getByRole('button', { name: 'Keys Lab', exact: true }).click();
  await page.getByRole('heading', { name: 'Keys Lab', exact: true }).waitFor();
  for (const path of ['learn', 'keys/k03', 'normalisation/n-orders-3', 'sql/s05', 'constraints/c08', 'mistakes', 'review']) {
    await route(path); await checkNoOverflow();
  }
  await page.screenshot({ path: 'test-results/review-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(300);
  await route('home');
  await page.getByRole('button', { name: 'Redefinir progresso' }).click();
  await page.getByRole('button', { name: 'Apagar e recomeçar' }).click();
  assert.deepEqual((await data()).attempts, {});
  assert.deepEqual((await data()).bookmarks, []);
  assert.deepEqual((await data()).completed, []);
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  assert.deepEqual(errors, [], 'No runtime browser errors');
  assert.deepEqual(remoteRequests, [], 'App does not require remote fonts, APIs or other external requests');
  console.log('PASS: mobile navigation and all modules without page overflow; confirmed reset; no runtime errors or external requests');
} finally { await browser.close(); }
