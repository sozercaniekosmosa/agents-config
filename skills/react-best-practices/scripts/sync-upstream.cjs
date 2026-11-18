#!/usr/bin/env node
/**
 * Обновление vendored-правил Vercel React Best Practices.
 *
 * Скачивает tarball upstream-репозитория (1 API-запрос вместо 70+), копирует
 * ${RULES_PATH}/*.md в references/rules и обновляет upstream-manifest.json.
 * Локальные файлы навыка (SKILL.md, applicability.md, adaptations, checklist)
 * никогда не изменяются.
 *
 * Использование:
 *   node scripts/sync-upstream.cjs                # обновить правила и manifest
 *   node scripts/sync-upstream.cjs --check        # только показать дрейф (exit 1)
 *   node scripts/sync-upstream.cjs --ref <sha>    # зафиксировать конкретный коммит
 *   node scripts/sync-upstream.cjs --no-prune     # не удалять правила, удалённые upstream
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = 'vercel-labs/agent-skills';
const SKILL_PATH = 'skills/react-best-practices';
const RULES_PATH = SKILL_PATH + '/rules';
const API = 'https://api.github.com';

const SKILL_DIR = path.resolve(__dirname, '..');
const RULES_DIR = path.join(SKILL_DIR, 'references', 'rules');
const MANIFEST_FILE = path.join(SKILL_DIR, 'references', 'upstream-manifest.json');

/** Разобранные аргументы CLI. */
function parseArgs(argv) {
  const opts = { check: false, prune: true, ref: 'main' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--no-prune') opts.prune = false;
    else if (arg === '--ref') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--ref требует значения');
      opts.ref = value;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node sync-upstream.cjs [--check] [--ref <sha|branch>] [--no-prune]');
      process.exit(0);
    } else {
      throw new Error('Неизвестный аргумент: ' + arg);
    }
  }
  return opts;
}

/** Запрос к GitHub API с понятной ошибкой при rate limit. */
async function ghJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'react-best-practices-sync' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 429
      ? ' Похоже на rate limit: задайте GITHUB_TOKEN.'
      : '';
    throw new Error('GitHub API ' + res.status + ' ' + url + '.' + hint);
  }
  return res.json();
}

/** Коммит, в котором последний раз менялся каталог правил. */
async function resolveCommit(ref) {
  const url = API + '/repos/' + REPO + '/commits?path=' + encodeURIComponent(RULES_PATH) + '&sha=' + encodeURIComponent(ref) + '&per_page=1';
  const commits = await ghJson(url);
  if (!Array.isArray(commits) || commits.length === 0) {
    const head = await ghJson(API + '/repos/' + REPO + '/commits/' + encodeURIComponent(ref));
    return { sha: head.sha, date: (head.commit && head.commit.author && head.commit.author.date) || null };
  }
  const c = commits[0];
  return { sha: c.sha, date: (c.commit && c.commit.author && c.commit.author.date) || null };
}

/** Скачивание и распаковка tarball в временный каталог. */
async function downloadRules(sha) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rbp-sync-'));
  const archive = path.join(tmp, 'upstream.tar.gz');
  const headers = { 'User-Agent': 'react-best-practices-sync' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const res = await fetch(API + '/repos/' + REPO + '/tarball/' + sha, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error('Не удалось скачать tarball: HTTP ' + res.status);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  execFileSync('tar', ['-xzf', archive, '-C', tmp], { stdio: 'ignore' });
  const rootEntry = fs.readdirSync(tmp, { withFileTypes: true }).find((e) => e.isDirectory());
  if (!rootEntry) throw new Error('Пустой tarball');
  const rulesDir = path.join(tmp, rootEntry.name, SKILL_PATH, 'rules');
  if (!fs.existsSync(rulesDir)) throw new Error('В tarball нет ' + RULES_PATH);
  const files = {};
  for (const name of fs.readdirSync(rulesDir).filter((n) => n.endsWith('.md')).sort()) {
    const buf = fs.readFileSync(path.join(rulesDir, name));
    files[name] = { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), content: buf };
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return files;
}

/** Хэши локальных правил. */
function localHashes() {
  const out = {};
  if (!fs.existsSync(RULES_DIR)) return out;
  for (const name of fs.readdirSync(RULES_DIR).filter((n) => n.endsWith('.md')).sort()) {
    const buf = fs.readFileSync(path.join(RULES_DIR, name));
    out[name] = { bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  }
  return out;
}

/** Запись файла через временный файл, чтобы не оставить половину. */
function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/** Точка входа. */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const commit = await resolveCommit(opts.ref);
  const remote = await downloadRules(commit.sha);
  const local = localHashes();

  const added = Object.keys(remote).filter((n) => !local[n]);
  const updated = Object.keys(remote).filter((n) => local[n] && local[n].sha256 !== remote[n].sha256);
  const removed = Object.keys(local).filter((n) => !remote[n]);
  const drift = added.length + updated.length + removed.length;

  console.log('[sync] upstream commit: ' + commit.sha + (commit.date ? ' (' + commit.date + ')' : ''));
  console.log('[sync] added: ' + added.length + ', updated: ' + updated.length + ', removed: ' + removed.length);

  if (opts.check) {
    for (const n of added) console.log('  + ' + n);
    for (const n of updated) console.log('  ~ ' + n);
    for (const n of removed) console.log('  - ' + n);
    if (drift > 0) {
      console.log('[sync] дрейф обнаружен. Обновление: node scripts/sync-upstream.cjs');
      process.exit(1);
    }
    console.log('[sync] правила соответствуют upstream.');
    return;
  }

  if (drift === 0) {
    console.log('[sync] обновление не требуется.');
    return;
  }

  fs.mkdirSync(RULES_DIR, { recursive: true });
  for (const n of [...added, ...updated]) atomicWrite(path.join(RULES_DIR, n), remote[n].content);
  if (opts.prune) {
    for (const n of removed) fs.rmSync(path.join(RULES_DIR, n), { force: true });
  }

  let manifest = {};
  if (fs.existsSync(MANIFEST_FILE)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); } catch { manifest = {}; }
  }
  const files = {};
  for (const n of Object.keys(remote).sort()) files[n] = { bytes: remote[n].bytes, sha256: remote[n].sha256 };
  const skillCommit = await ghJson(API + '/repos/' + REPO + '/commits?path=' + encodeURIComponent(SKILL_PATH) + '&sha=' + commit.sha + '&per_page=1')
    .then((rows) => (rows[0] && rows[0].sha) || null)
    .catch(() => null);
  manifest.source = Object.assign({}, manifest.source, {
    repository: 'https://github.com/' + REPO,
    path: RULES_PATH,
    commit: commit.sha,
    commitDate: commit.date ? commit.date.slice(0, 10) : null,
    skillDirLastCommit: skillCommit,
    syncedAt: new Date().toISOString(),
  });
  manifest.files = files;
  atomicWrite(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');

  console.log('[sync] обновлено. Сверьте references/applicability.md с новыми правилами:');
  if (added.length) console.log('  новые правила без статуса → SKIP до решения: ' + added.join(', '));
  if (removed.length) console.log('  удалённые из upstream: ' + removed.join(', '));
}

main().catch((err) => {
  console.error('[sync] ' + err.message);
  process.exit(1);
});
