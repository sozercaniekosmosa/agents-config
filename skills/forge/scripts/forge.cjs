#!/usr/bin/env node
'use strict';

// Тонкий CLI конструктора навыков: разбор аргументов и диспетчеризация.
// Логика: scripts/lib/{spec,render,check,sync,new}.cjs; шаблон трекера: scripts/templates/track.cjs.tpl.

const { flagsOf, usage } = require('./lib/cli.cjs');
const { cmdNew, cmdSpec } = require('./lib/new.cjs');
const { cmdCheck } = require('./lib/check.cjs');
const { cmdUpdate, cmdUpgrade } = require('./lib/sync.cjs');

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') return usage();
  const flags = flagsOf(argv.slice(1));
  switch (command) {
    case 'spec':
      return cmdSpec();
    case 'new':
      return cmdNew(flags);
    case 'check':
      return cmdCheck(flags);
    case 'update':
      return cmdUpdate(flags._.join(' ').trim());
    case 'upgrade':
      return cmdUpgrade(flags);
    default:
      console.error('Неизвестная команда: ' + command);
      usage();
      process.exit(1);
  }
}

main();
