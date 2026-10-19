#!/usr/bin/env node

/**
 * @file pocket.cjs
 * CLI Dispatcher for pocket skill.
 * Manages encrypted archives in remote git branch 'pocket' (Zero Local Footprint).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const crypto = require('../core/crypto.cjs');
const git = require('../core/git.cjs');
const packer = require('../core/packer.cjs');

/**
 * Parses a simple .env file without external dependencies.
 * @param {string} envFilePath
 * @returns {Record<string, string>}
 */
function parseEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    return {};
  }
  const content = fs.readFileSync(envFilePath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

/**
 * Resolves the secret encryption key from environment or .env files.
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveSecretKey(projectRoot) {
  if (process.env.POCKET_SECRET_KEY) {
    return process.env.POCKET_SECRET_KEY;
  }

  // 1. Check skill-local .env
  const skillEnvPath = path.resolve(__dirname, '..', '.env');
  const skillEnv = parseEnvFile(skillEnvPath);
  if (skillEnv.POCKET_SECRET_KEY) {
    return skillEnv.POCKET_SECRET_KEY;
  }

  // 2. Check project root .env
  const rootEnvPath = path.join(projectRoot, '.env');
  const rootEnv = parseEnvFile(rootEnvPath);
  if (rootEnv.POCKET_SECRET_KEY) {
    return rootEnv.POCKET_SECRET_KEY;
  }

  throw new Error(
    "POCKET_SECRET_KEY is not defined. Create '.agents/skills/pocket/.env' from '_.env' or set env var."
  );
}

/**
 * Resolves the remote repository URL for pocket storage.
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveRemoteUrl(projectRoot) {
  if (process.env.POCKET_REMOTE_URL) {
    return process.env.POCKET_REMOTE_URL;
  }

  // 1. Check skill-local .env
  const skillEnvPath = path.resolve(__dirname, '..', '.env');
  const skillEnv = parseEnvFile(skillEnvPath);
  if (skillEnv.POCKET_REMOTE_URL) {
    return skillEnv.POCKET_REMOTE_URL;
  }

  // 2. Check project root .env
  const rootEnvPath = path.join(projectRoot, '.env');
  const rootEnv = parseEnvFile(rootEnvPath);
  if (rootEnv.POCKET_REMOTE_URL) {
    return rootEnv.POCKET_REMOTE_URL;
  }

  return git.DEFAULT_REMOTE_URL;
}

/**
 * Formats date as YY-MM-DD-HH-MM.
 * @param {Date} [date]
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yy}-${mm}-${dd}-${hh}-${min}`;
}

/**
 * Resolves pocket name and source paths from CLI arguments.
 * Supports name before paths, after paths, or auto-generated name.
 * Attaches timestamp YY-MM-DD-HH-MM before name.
 * @param {string[]} rawArgs
 * @param {string} projectRoot
 * @returns {{ pocketName: string, paths: string[] }}
 */
function resolveNameAndPaths(rawArgs, projectRoot) {
  if (!rawArgs || rawArgs.length === 0) {
    throw new Error('create requires at least one source file or directory path');
  }

  const isExistingPath = (arg) => {
    try {
      return fs.existsSync(path.resolve(projectRoot, arg)) || fs.existsSync(arg);
    } catch {
      return false;
    }
  };

  let candidateName = '';
  let paths = [];

  if (rawArgs.length === 1) {
    if (isExistingPath(rawArgs[0])) {
      paths = [rawArgs[0]];
    } else {
      throw new Error(`Path '${rawArgs[0]}' does not exist in workspace.`);
    }
  } else {
    const firstIsPath = isExistingPath(rawArgs[0]);
    const lastIsPath = isExistingPath(rawArgs[rawArgs.length - 1]);

    if (!firstIsPath && lastIsPath) {
      candidateName = rawArgs[0];
      paths = rawArgs.slice(1);
    } else if (firstIsPath && !lastIsPath) {
      candidateName = rawArgs[rawArgs.length - 1];
      paths = rawArgs.slice(0, -1);
    } else if (firstIsPath && lastIsPath) {
      candidateName = '';
      paths = rawArgs;
    } else {
      candidateName = rawArgs[0];
      paths = rawArgs.slice(1);
    }
  }

  if (!candidateName) {
    const baseFirst = path.basename(paths[0]).replace(/\.[^.]+$/, '').trim();
    candidateName = baseFirst || 'pocket';
  }

  const tsRegex = /^\d{2}-\d{2}-\d{2}-\d{2}-\d{2}|\[\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\]/;
  let finalName = candidateName;
  if (!tsRegex.test(finalName)) {
    finalName = `${formatTimestamp()}_${candidateName}`;
  }

  return { pocketName: finalName, paths };
}

/**
 * Prints help message.
 */
function printHelp() {
  console.log(`Usage:
  node .agents/skills/pocket/scripts/pocket.cjs [list]
  node .agents/skills/pocket/scripts/pocket.cjs create [<name>] <paths...>
  node .agents/skills/pocket/scripts/pocket.cjs unpack <name|index>
  node .agents/skills/pocket/scripts/pocket.cjs delete <name|index>

Commands:
  (no args) or list           Show all saved pockets in remote branch 'pocket'
  create [<name>] <paths...>  Pack and encrypt files/directories, push to remote 'pocket', wipe local ref
  unpack <name|index>         Fetch from remote 'pocket', decrypt and unpack into project with auto-replace
  delete <name|index>         Delete pocket archive from remote branch 'pocket'
`);
}

async function handleCreate(pocketName, paths, projectRoot) {
  if (!pocketName || !paths || paths.length === 0) {
    throw new Error('create requires <name> and at least one <path>');
  }

  if (!/^[\p{L}\p{N}_\-\.\[\]]+$/u.test(pocketName)) {
    throw new Error("Invalid pocket name. Use only letters, digits, '.', '_', '-', '[', or ']'.");
  }

  const secretKey = resolveSecretKey(projectRoot);
  const remoteUrl = resolveRemoteUrl(projectRoot);

  console.log(`Packing ${paths.length} source path(s) into pocket '${pocketName}'...`);
  const { buffer: zipBuffer, manifest } = await packer.packPaths(paths, projectRoot);

  console.log(`Packed ${manifest.length} entry/entries:`);
  for (const item of manifest) {
    console.log(`  - ${item}`);
  }

  console.log(`Encrypting ZIP archive (${zipBuffer.length} bytes) via AES-256-GCM...`);
  const encrypted = crypto.encryptBuffer(zipBuffer, secretKey);

  console.log(`Pushing encrypted blob (${encrypted.length} bytes) to remote: ${remoteUrl} [branch: pocket]...`);
  const commitSha = git.savePocketBlob(pocketName, encrypted, remoteUrl);

  console.log(`✓ Pocket '${pocketName}' successfully created and pushed to remote (commit: ${commitSha.slice(0, 8)})`);
  console.log(`✓ Local pocket branch wiped (Zero Local Footprint).`);
}

async function handleUnpack(pocketName, projectRoot) {
  if (!pocketName) {
    throw new Error('unpack requires <name>');
  }

  const secretKey = resolveSecretKey(projectRoot);
  const remoteUrl = resolveRemoteUrl(projectRoot);

  console.log(`Fetching pocket '${pocketName}' from remote: ${remoteUrl} [branch: pocket]...`);
  let encrypted;
  let resolvedPocketName = pocketName;

  try {
    encrypted = git.readPocketBlob(resolvedPocketName, remoteUrl);
  } catch (initialErr) {
    const remotePockets = git.listPockets(remoteUrl);

    const num = parseInt(pocketName, 10);
    if (!isNaN(num) && String(num) === pocketName.trim() && num >= 1 && num <= remotePockets.length) {
      resolvedPocketName = remotePockets[num - 1].name;
      console.log(`Resolved index #${num} to pocket '${resolvedPocketName}'`);
      encrypted = git.readPocketBlob(resolvedPocketName, remoteUrl);
    } else {
      const matches = remotePockets.filter((p) => {
        if (p.name === pocketName) return true;
        if (p.name.endsWith(`_${pocketName}`)) return true;
        if (p.name.startsWith(`${pocketName}_[`)) return true;
        if (p.name.startsWith(`${pocketName}-[`)) return true;
        return p.name.includes(pocketName);
      });

      if (matches.length > 0) {
        resolvedPocketName = matches[matches.length - 1].name;
        console.log(`Matched pocket '${resolvedPocketName}' for query '${pocketName}'`);
        encrypted = git.readPocketBlob(resolvedPocketName, remoteUrl);
      } else {
        throw initialErr;
      }
    }
  }

  console.log(`Decrypting payload (${encrypted.length} bytes)...`);
  let zipBuffer;
  try {
    zipBuffer = crypto.decryptBuffer(encrypted, secretKey);
  } catch (err) {
    throw new Error(`Decryption failed for pocket '${resolvedPocketName}'. Check POCKET_SECRET_KEY. (${err.message})`);
  }

  console.log('Inspecting archive contents...');
  const { preview, restored, collided } = await packer.unpackArchive(zipBuffer, projectRoot);

  console.log(`\n[Preview] ${preview.length} item(s) mapped for extraction:`);
  for (const item of preview) {
    const typeLabel = item.isDir ? '[DIR]' : '[FILE]';
    console.log(`  ${typeLabel} ${item.path} → ${item.target}`);
  }

  console.log(`\nRestored ${restored.length} item(s) successfully.`);

  if (collided.length > 0) {
    console.warn(`\n[Warning] ${collided.length} item(s) had collisions/write errors and were placed in '.pocket/':`);
    for (const c of collided) {
      console.warn(`  ! ${c.path} → ${c.target} (Reason: ${c.error})`);
    }
  }

  console.log(`✓ Pocket '${resolvedPocketName}' unpacked.`);
  console.log(`✓ Zero Local Footprint preserved.`);
}

function handleList(projectRoot) {
  const remoteUrl = resolveRemoteUrl(projectRoot);
  console.log(`Fetching pockets from remote: ${remoteUrl} [branch: pocket]...`);
  const pockets = git.listPockets(remoteUrl);
  if (pockets.length === 0) {
    console.log("No pockets found in remote branch 'pocket'.");
    return;
  }

  console.log(`Pockets in remote branch 'pocket' (${pockets.length}):`);
  pockets.forEach((p, idx) => {
    const sizeKB = (p.size / 1024).toFixed(1);
    const dateStr = p.date ? ` | ${p.date}` : '';
    console.log(`  ${idx + 1}. ${p.name} (${sizeKB} KB${dateStr}) [sha: ${p.sha.slice(0, 8)}]`);
  });
}

async function handleDelete(pocketIdentifier, projectRoot) {
  if (!pocketIdentifier) {
    throw new Error('delete requires <name|index>');
  }

  const remoteUrl = resolveRemoteUrl(projectRoot);
  console.log(`Resolving pocket '${pocketIdentifier}' on remote: ${remoteUrl} [branch: pocket]...`);

  const remotePockets = git.listPockets(remoteUrl);
  if (remotePockets.length === 0) {
    throw new Error("No pockets found in remote repository.");
  }

  let resolvedPocketName = null;
  const num = parseInt(pocketIdentifier, 10);
  if (!isNaN(num) && String(num) === String(pocketIdentifier).trim() && num >= 1 && num <= remotePockets.length) {
    resolvedPocketName = remotePockets[num - 1].name;
    console.log(`Resolved index #${num} to pocket '${resolvedPocketName}'`);
  } else {
    const matches = remotePockets.filter((p) => {
      if (p.name === pocketIdentifier) return true;
      if (p.name.endsWith(`_${pocketIdentifier}`)) return true;
      if (p.name.startsWith(`${pocketIdentifier}_[`)) return true;
      if (p.name.startsWith(`${pocketIdentifier}-[`)) return true;
      return p.name.includes(pocketIdentifier);
    });

    if (matches.length > 0) {
      resolvedPocketName = matches[matches.length - 1].name;
      console.log(`Matched pocket '${resolvedPocketName}' for query '${pocketIdentifier}'`);
    } else {
      throw new Error(`Pocket '${pocketIdentifier}' not found in remote repository.`);
    }
  }

  console.log(`Deleting pocket '${resolvedPocketName}' from remote: ${remoteUrl} [branch: pocket]...`);
  const commitSha = git.deletePocketBlob(resolvedPocketName, remoteUrl);

  console.log(`✓ Pocket '${resolvedPocketName}' successfully deleted from remote (commit: ${commitSha.slice(0, 8)})`);
  console.log(`✓ Zero Local Footprint preserved.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    printHelp();
    return;
  }

  const projectRoot = git.getRepoRoot();

  // If no arguments passed, default to list
  if (args.length === 0) {
    handleList(projectRoot);
    return;
  }

  const command = args[0];

  try {
    switch (command) {
      case 'create': {
        const rawCreateArgs = args.slice(1);
        const { pocketName, paths } = resolveNameAndPaths(rawCreateArgs, projectRoot);
        await handleCreate(pocketName, paths, projectRoot);
        break;
      }
      case 'unpack':
      case 'restore': {
        const pocketName = args[1];
        await handleUnpack(pocketName, projectRoot);
        break;
      }
      case 'delete':
      case 'remove':
      case 'rm': {
        const pocketName = args[1];
        await handleDelete(pocketName, projectRoot);
        break;
      }
      case 'list': {
        handleList(projectRoot);
        break;
      }
      default: {
        console.error(`Unknown command: '${command}'`);
        printHelp();
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(`\n[Pocket Error] ${err.message}`);
    process.exitCode = 1;
  }
}

main();
