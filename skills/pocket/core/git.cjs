/**
 * @file git.cjs
 * Low-level Git Plumbing adapter.
 * Manages the isolated 'pocket' branch on remote repository without checking out or altering the working tree.
 * Guarantees Zero Local Footprint: local refs/heads/pocket is wiped after remote push.
 */

'use strict';

const { execFileSync } = require('node:child_process');

const BRANCH_REF = 'refs/heads/pocket';
const DEFAULT_REMOTE_URL = 'https://github.com/sozercaniekosmosa/agents-config.git';
const MAX_BUFFER = 100 * 1024 * 1024; // 100 MB max blob size

/**
 * Executes a git command safely using execFileSync.
 * @param {string[]} args
 * @param {object} [options]
 * @returns {Buffer|string}
 */
function gitExec(args, options = {}) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'sozercaniekosmosa',
    GIT_AUTHOR_EMAIL: 'sozercaniekosmosa@users.noreply.github.com',
    GIT_COMMITTER_NAME: 'sozercaniekosmosa',
    GIT_COMMITTER_EMAIL: 'sozercaniekosmosa@users.noreply.github.com',
    ...(options.env || {})
  };
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      ...options,
      env
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const message = stderr || err.message;
    const error = new Error(`Git command failed [git ${args.join(' ')}]: ${message}`);
    error.status = err.status;
    error.stderr = stderr;
    throw error;
  }
}

/**
 * Returns the repository root absolute path.
 * @returns {string}
 */
function getRepoRoot() {
  const out = gitExec(['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return out.trim();
}

/**
 * Wipes the local 'pocket' branch ref and tag if any exist.
 * Ensures Zero Local Footprint.
 */
function wipeLocalPocketRef() {
  try {
    gitExec(['update-ref', '-d', BRANCH_REF], { stdio: 'pipe' });
  } catch {}
  try {
    gitExec(['branch', '-D', 'pocket'], { stdio: 'pipe' });
  } catch {}
}

/**
 * Fetches the remote 'pocket' branch ref into FETCH_HEAD.
 * @param {string} [remoteUrl]
 * @returns {boolean} true if remote branch exists and was fetched
 */
function fetchRemotePocket(remoteUrl = DEFAULT_REMOTE_URL) {
  try {
    gitExec(['fetch', '--no-tags', remoteUrl, BRANCH_REF], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the commit SHA of FETCH_HEAD after a successful fetch, or null.
 * @returns {string|null}
 */
function getRemoteCommitSha() {
  try {
    const out = gitExec(['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Checks whether the 'pocket' branch ref exists (either in FETCH_HEAD or locally).
 * @param {string} [remoteUrl]
 * @returns {boolean}
 */
function hasPocketBranch(remoteUrl = DEFAULT_REMOTE_URL) {
  if (fetchRemotePocket(remoteUrl)) {
    return true;
  }
  try {
    gitExec(['rev-parse', '--verify', BRANCH_REF], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stores a binary buffer in the git object database.
 * @param {Buffer} buffer
 * @returns {string} blob SHA
 */
function writeBlob(buffer) {
  const out = gitExec(['hash-object', '-w', '--stdin'], {
    input: buffer,
    encoding: 'utf8'
  });
  return out.trim();
}

/**
 * Reads a blob by name from the remote pocket branch.
 * @param {string} pocketName
 * @param {string} [remoteUrl]
 * @returns {Buffer}
 */
function readPocketBlob(pocketName, remoteUrl = DEFAULT_REMOTE_URL) {
  const fetched = fetchRemotePocket(remoteUrl);
  const targetRef = fetched ? 'FETCH_HEAD' : (hasPocketBranch(remoteUrl) ? BRANCH_REF : null);

  if (!targetRef) {
    throw new Error(`Remote branch '${BRANCH_REF}' does not exist on '${remoteUrl}'.`);
  }

  try {
    const data = gitExec(['cat-file', '-p', `${targetRef}:${pocketName}`]);
    wipeLocalPocketRef();
    return data;
  } catch (err) {
    wipeLocalPocketRef();
    throw new Error(`Pocket '${pocketName}' not found in remote repository.`);
  }
}

/**
 * Lists all pocket archives stored in the remote 'pocket' branch tree.
 * @param {string} [remoteUrl]
 * @returns {Array<{ name: string, size: number, sha: string, date: string }>}
 */
function listPockets(remoteUrl = DEFAULT_REMOTE_URL) {
  const fetched = fetchRemotePocket(remoteUrl);
  let targetRef = null;

  if (fetched) {
    targetRef = 'FETCH_HEAD';
  } else {
    try {
      gitExec(['rev-parse', '--verify', BRANCH_REF], { stdio: 'pipe' });
      targetRef = BRANCH_REF;
    } catch {
      return [];
    }
  }

  const rawTree = gitExec(['ls-tree', '-l', targetRef], { encoding: 'utf8' }).trim();
  if (!rawTree) {
    wipeLocalPocketRef();
    return [];
  }

  const lines = rawTree.split(/\r?\n/).filter(Boolean);
  const results = [];

  for (const line of lines) {
    // Format: <mode> <type> <sha> <size>\t<name>
    const match = line.match(/^(\d+)\s+(\w+)\s+([a-f0-9]+)\s+(\S+)\t(.+)$/);
    if (!match) continue;

    const [, , type, sha, sizeStr, name] = match;
    if (type !== 'blob') continue;

    const size = parseInt(sizeStr, 10) || 0;

    let date = '';
    try {
      date = gitExec(
        ['log', '-1', '--format=%cd', '--date=iso', targetRef, '--', name],
        { encoding: 'utf8' }
      ).trim();
    } catch {
      date = '';
    }

    results.push({ name, size, sha, date });
  }

  wipeLocalPocketRef();
  return results;
}

/**
 * Saves a pocket blob, pushes it to remote 'pocket' branch, and wipes the local ref.
 * @param {string} pocketName
 * @param {Buffer} encryptedBuffer
 * @param {string} [remoteUrl]
 * @returns {string} new commit SHA
 */
function savePocketBlob(pocketName, encryptedBuffer, remoteUrl = DEFAULT_REMOTE_URL) {
  const blobSha = writeBlob(encryptedBuffer);

  // 1. Fetch remote pocket tree if available
  const fetched = fetchRemotePocket(remoteUrl);
  let parentSha = null;
  let targetTreeRef = null;

  if (fetched) {
    parentSha = getRemoteCommitSha();
    targetTreeRef = 'FETCH_HEAD';
  } else {
    // If remote doesn't have it yet, check if local has anything
    try {
      const localSha = gitExec(['rev-parse', BRANCH_REF], { encoding: 'utf8' }).trim();
      if (localSha) {
        parentSha = localSha;
        targetTreeRef = BRANCH_REF;
      }
    } catch {}
  }

  // 2. Read existing entries from current tree
  const existingEntries = new Map();
  if (targetTreeRef) {
    try {
      const rawTree = gitExec(['ls-tree', targetTreeRef], { encoding: 'utf8' }).trim();
      if (rawTree) {
        for (const line of rawTree.split(/\r?\n/).filter(Boolean)) {
          const tabIdx = line.indexOf('\t');
          if (tabIdx === -1) continue;
          const meta = line.slice(0, tabIdx).trim();
          const name = line.slice(tabIdx + 1);
          existingEntries.set(name, meta);
        }
      }
    } catch {}
  }

  // 3. Update or insert entry for pocketName
  existingEntries.set(pocketName, `100644 blob ${blobSha}`);

  // 4. Build input for git mktree
  const mktreeLines = [];
  for (const [name, meta] of existingEntries.entries()) {
    mktreeLines.push(`${meta}\t${name}`);
  }
  const mktreeInput = mktreeLines.join('\n') + '\n';

  const newTreeSha = gitExec(['mktree'], {
    input: mktreeInput,
    encoding: 'utf8'
  }).trim();

  // 5. Create commit
  const commitArgs = ['commit-tree', newTreeSha];
  if (parentSha) {
    commitArgs.push('-p', parentSha);
  }
  commitArgs.push('-m', `pocket: update archive '${pocketName}'`);

  const newCommitSha = gitExec(commitArgs, { encoding: 'utf8' }).trim();

  // 6. Push commit to remote 'pocket' branch
  try {
    gitExec(['push', remoteUrl, `${newCommitSha}:${BRANCH_REF}`]);
  } catch (pushErr) {
    throw new Error(`Failed to push pocket to remote '${remoteUrl}': ${pushErr.message}`);
  }

  // 7. Wipe local ref to ensure Zero Local Footprint
  wipeLocalPocketRef();

  return newCommitSha;
}

/**
 * Deletes a pocket blob from remote 'pocket' branch tree and wipes the local ref.
 * @param {string} pocketName
 * @param {string} [remoteUrl]
 * @returns {string} new commit SHA
 */
function deletePocketBlob(pocketName, remoteUrl = DEFAULT_REMOTE_URL) {
  const fetched = fetchRemotePocket(remoteUrl);
  let parentSha = null;
  let targetTreeRef = null;

  if (fetched) {
    parentSha = getRemoteCommitSha();
    targetTreeRef = 'FETCH_HEAD';
  } else {
    try {
      const localSha = gitExec(['rev-parse', BRANCH_REF], { encoding: 'utf8' }).trim();
      if (localSha) {
        parentSha = localSha;
        targetTreeRef = BRANCH_REF;
      }
    } catch {}
  }

  if (!targetTreeRef) {
    throw new Error(`Remote branch '${BRANCH_REF}' does not exist on '${remoteUrl}'.`);
  }

  // Read existing entries
  const existingEntries = new Map();
  try {
    const rawTree = gitExec(['ls-tree', targetTreeRef], { encoding: 'utf8' }).trim();
    if (rawTree) {
      for (const line of rawTree.split(/\r?\n/).filter(Boolean)) {
        const tabIdx = line.indexOf('\t');
        if (tabIdx === -1) continue;
        const meta = line.slice(0, tabIdx).trim();
        const name = line.slice(tabIdx + 1);
        existingEntries.set(name, meta);
      }
    }
  } catch (err) {
    wipeLocalPocketRef();
    throw new Error(`Failed to read remote pocket tree: ${err.message}`);
  }

  if (!existingEntries.has(pocketName)) {
    wipeLocalPocketRef();
    throw new Error(`Pocket '${pocketName}' not found in remote repository.`);
  }

  // Remove the entry
  existingEntries.delete(pocketName);

  // Build input for git mktree
  const mktreeLines = [];
  for (const [name, meta] of existingEntries.entries()) {
    mktreeLines.push(`${meta}\t${name}`);
  }
  const mktreeInput = mktreeLines.length > 0 ? (mktreeLines.join('\n') + '\n') : '';

  const newTreeSha = gitExec(['mktree'], {
    input: mktreeInput,
    encoding: 'utf8'
  }).trim();

  // Create commit
  const commitArgs = ['commit-tree', newTreeSha];
  if (parentSha) {
    commitArgs.push('-p', parentSha);
  }
  commitArgs.push('-m', `pocket: delete archive '${pocketName}'`);

  const newCommitSha = gitExec(commitArgs, { encoding: 'utf8' }).trim();

  // Push commit to remote 'pocket' branch
  try {
    gitExec(['push', remoteUrl, `${newCommitSha}:${BRANCH_REF}`]);
  } catch (pushErr) {
    throw new Error(`Failed to push changes to remote '${remoteUrl}': ${pushErr.message}`);
  } finally {
    wipeLocalPocketRef();
  }

  return newCommitSha;
}

module.exports = {
  BRANCH_REF,
  DEFAULT_REMOTE_URL,
  getRepoRoot,
  hasPocketBranch,
  wipeLocalPocketRef,
  fetchRemotePocket,
  readPocketBlob,
  savePocketBlob,
  deletePocketBlob,
  listPockets
};

