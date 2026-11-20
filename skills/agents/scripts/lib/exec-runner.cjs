/**
 * Sandbox-safe shell/Git runner shared by skill scripts.
 *
 * Two environment constraints are handled here:
 * 1. Restricted (sandboxed) sessions deny anonymous pipes, so child processes
 *    spawned with piped stdio fail with EPERM. Output is captured through
 *    temporary files instead: no pipe, same result.
 * 2. Windows schannel cannot always acquire credentials inside a restricted
 *    session (SEC_E_NO_CREDENTIALS). Git over HTTPS is retried once with the
 *    bundled openssl TLS backend, which reads its CA bundle directly.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GIT_IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'sozercaniekosmosa',
  GIT_AUTHOR_EMAIL: 'sozercaniekosmosa@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'sozercaniekosmosa',
  GIT_COMMITTER_EMAIL: 'sozercaniekosmosa@users.noreply.github.com'
};

const GIT_NON_INTERACTIVE_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_EDITOR: 'true'
};

const TLS_AUTH_ERROR_RE = /SEC_E_NO_CREDENTIALS|schannel|AcquireCredentialsHandle|SSL certificate problem|unable to access/i;

function gitEnv(extra = {}) {
  return { ...GIT_NON_INTERACTIVE_ENV, ...GIT_IDENTITY_ENV, ...extra };
}

function readIfExists(file) {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  } catch {
    return '';
  }
}

function execCapture(command, options = {}) {
  const cwd = options.cwd || process.cwd();
  const captureDir = options.captureDir || path.join(os.tmpdir(), 'dsh-exec-cache');
  if (!fs.existsSync(captureDir)) fs.mkdirSync(captureDir, { recursive: true });
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outFile = path.join(captureDir, `exec-${stamp}.out`);
  const errFile = path.join(captureDir, `exec-${stamp}.err`);
  try {
    const res = spawnSync(`${command} > "${outFile}" 2> "${errFile}"`, {
      cwd,
      env: { ...process.env, ...gitEnv(options.env) },
      shell: true,
      stdio: 'ignore',
      windowsHide: true
    });
    const stdout = readIfExists(outFile);
    const stderr = readIfExists(errFile);
    if (res.error) {
      const err = new Error(res.error.message);
      err.stdout = stdout;
      err.stderr = stderr;
      throw err;
    }
    if (res.status !== 0) {
      const err = new Error((stderr || stdout || `command exited with code ${res.status}`).trim());
      err.status = res.status;
      err.stdout = stdout;
      err.stderr = stderr;
      throw err;
    }
    return stdout;
  } finally {
    for (const file of [outFile, errFile]) {
      try { fs.rmSync(file, { force: true }); } catch {}
    }
  }
}

function isTlsAuthError(err) {
  const text = `${(err && err.stderr) || ''}${(err && err.stdout) || ''}${(err && err.message) || ''}`;
  return TLS_AUTH_ERROR_RE.test(text);
}

function runCommand(command, options = {}) {
  try {
    return execCapture(command, options);
  } catch (err) {
    const canRetryTls = !options.noTlsRetry && /^git /.test(command) && isTlsAuthError(err);
    if (!canRetryTls) throw err;
    console.warn('[sync] schannel TLS unavailable → retry with openssl backend');
    return execCapture(command.replace(/^git /, 'git -c http.sslBackend=openssl '), { ...options, noTlsRetry: true });
  }
}

/** Creates git runners bound to one work tree pair (--git-dir / --work-tree). */
function createGitRunner({ agentsDir, captureDir }) {
  const gitDir = path.join(agentsDir, '.git');
  const baseCommand = `git --git-dir="${gitDir}" --work-tree="${agentsDir}"`;

  function runGit(args, options = {}) {
    try {
      return runCommand(`${baseCommand} ${args}`, {
        cwd: agentsDir,
        captureDir,
        env: options.env,
        noTlsRetry: options.noTlsRetry
      });
    } catch (err) {
      if (options.silent) throw err;
      console.error(`[sync err] ${err.message}`);
      if (err.stdout) console.log(err.stdout);
      if (err.stderr) console.error(err.stderr);
      throw err;
    }
  }

  function makeWorktreeGit(worktreeDir) {
    return (args) => runCommand(`git ${args}`, { cwd: worktreeDir, captureDir });
  }

  return { runGit, makeWorktreeGit };
}

module.exports = { gitEnv, execCapture, isTlsAuthError, runCommand, createGitRunner };
