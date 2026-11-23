'use strict';

// Общие утилиты CLI конструктора навыков.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SKILLS_DIR = path.join(ROOT, '.agents', 'skills');

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function git(args) {
  try {
    return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + date.getFullYear() +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function flagsOf(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function usage() {
  console.log('Использование:');
  console.log('  node .agents/skills/forge/scripts/forge.cjs spec                 # эталонный бриф');
  console.log('  node .agents/skills/forge/scripts/forge.cjs new --spec <file> [--out dir] [--force] [--dry-run]');
  console.log('  node .agents/skills/forge/scripts/forge.cjs check [--root dir] [--json]');
  console.log('  node .agents/skills/forge/scripts/forge.cjs update "<что изменилось>"');
  console.log('  node .agents/skills/forge/scripts/forge.cjs upgrade <skill> [--root dir]');
}

module.exports = { ROOT, SKILLS_DIR, rel, readJson, git, stamp, flagsOf, usage };
