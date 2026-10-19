/**
 * Isolated Git Sync script for central .agents repository (sozercaniekosmosa/agents-config)
 * Supports multi-project branch management and 2-stage sync:
 * 1. Common skills & AGENTS.md (main branch)
 * 2. Project-specific skills (project branch)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_URL = 'https://github.com/sozercaniekosmosa/agents-config.git';
const AGENTS_DIR = path.resolve(__dirname, '../../..');
const PROJECT_ROOT = path.resolve(AGENTS_DIR, '..');
const PARENT_GITIGNORE = path.join(PROJECT_ROOT, '.gitignore');
const CACHE_DIR = path.join(AGENTS_DIR, '.cache');
const PROJECT_CONFIG_FILE = path.join(CACHE_DIR, 'project.json');

function ensureParentGitignore() {
  if (!fs.existsSync(PROJECT_ROOT)) return;
  const entry = '.agents/.git';
  if (fs.existsSync(PARENT_GITIGNORE)) {
    const content = fs.readFileSync(PARENT_GITIGNORE, 'utf-8');
    if (!content.includes(entry)) {
      fs.appendFileSync(PARENT_GITIGNORE, `\n# Prevent .agents git metadata leaking to project git\n${entry}\n`);
      console.log(`[sync] Added ${entry} to parent .gitignore`);
    }
  } else {
    fs.writeFileSync(PARENT_GITIGNORE, `# Prevent .agents git metadata leaking to project git\n${entry}\n`);
    console.log(`[sync] Created parent .gitignore with ${entry}`);
  }
}

function runGit(args, options = {}) {
  const gitDir = path.join(AGENTS_DIR, '.git');
  const cmd = `git --git-dir="${gitDir}" --work-tree="${AGENTS_DIR}" ${args}`;
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: AGENTS_DIR, ...options });
  } catch (err) {
    if (options.silent) throw err;
    console.error(`[sync err] ${err.message}`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    throw err;
  }
}

function initGitIfNeeded() {
  const gitDir = path.join(AGENTS_DIR, '.git');
  if (!fs.existsSync(gitDir)) {
    console.log('[sync] Initializing git repo in .agents...');
    execSync(`git init "${AGENTS_DIR}"`, { encoding: 'utf-8' });
    runGit(`remote add origin ${REPO_URL}`);
    runGit('branch -M main');
  }
}

function ensureAgentGitignore() {
  const agentGitignore = path.join(AGENTS_DIR, '.gitignore');
  const required = [
    '.cache/',
    'skills/confluence/storage/',
    'skills/debug/.logs/',
    '**/.logs/',
    '**/storage/*.json',
    '*.patch'
  ];
  let content = fs.existsSync(agentGitignore) ? fs.readFileSync(agentGitignore, 'utf-8') : '';
  let updated = false;
  for (const entry of required) {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      updated = true;
    }
  }
  if (updated) {
    fs.writeFileSync(agentGitignore, content.trim() + '\n', 'utf-8');
    console.log('[sync] Ensured storage & log exclusions in .agents/.gitignore');
  }
}

function getProjectConfig() {
  if (fs.existsSync(PROJECT_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROJECT_CONFIG_FILE, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

function setProjectConfig(branch, skills = []) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const config = {
    projectBranch: branch,
    projectSkills: Array.isArray(skills) ? skills : [skills].filter(Boolean),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(PROJECT_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

function resetProjectConfig() {
  if (fs.existsSync(PROJECT_CONFIG_FILE)) {
    fs.unlinkSync(PROJECT_CONFIG_FILE);
    return true;
  }
  return false;
}

function getRemoteBranches() {
  try {
    const raw = runGit('ls-remote --heads origin', { silent: true });
    const branches = [];
    const lines = raw.trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const parts = line.trim().split(/\s+/);
      if (parts[1] && parts[1].startsWith('refs/heads/')) {
        const branch = parts[1].replace('refs/heads/', '');
        if (branch !== 'main') {
          branches.push(branch);
        }
      }
    }
    return branches;
  } catch {
    return [];
  }
}

function getAvailableSkills() {
  const skillsDir = path.join(AGENTS_DIR, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir).filter(name => {
    const full = path.join(skillsDir, name);
    return fs.statSync(full).isDirectory();
  });
}

function getCurrentBranch() {
  try {
    return runGit('branch --show-current', { silent: true }).trim();
  } catch {
    return '';
  }
}

function ensureBranch(branch) {
  const current = getCurrentBranch();
  if (current === branch) return;

  // Check if branch exists locally
  try {
    runGit(`show-ref --verify --quiet refs/heads/${branch}`, { silent: true });
    runGit(`checkout ${branch}`);
    return;
  } catch {}

  // Check if branch exists on origin
  try {
    runGit(`fetch origin ${branch}`, { silent: true });
    runGit(`checkout -b ${branch} origin/${branch}`);
    return;
  } catch {}

  // Create branch from main
  try {
    runGit(`checkout -b ${branch} main`);
    console.log(`[sync] Created local branch ${branch} from main`);
  } catch {
    runGit(`checkout -b ${branch}`);
    console.log(`[sync] Created local branch ${branch}`);
  }
}

function executePull() {
  const config = getProjectConfig();
  if (!config || !config.projectBranch) {
    console.error('[sync] Error: Project profile not set. Run "sync.cjs project-set <branch> [skills...]" first.');
    process.exit(1);
  }

  const { projectBranch } = config;
  console.log(`[sync] Starting 2-stage pull for project: ${projectBranch}...`);

  ensureBranch(projectBranch);

  // Stage 1: Common updates from main
  console.log('[sync] Stage 1 (Common): Fetching & merging updates from main...');
  try {
    runGit('fetch origin main');
    runGit('merge origin/main --no-edit');
    console.log('[sync] Stage 1 (Common): Updated successfully!');
  } catch (err) {
    console.warn(`[sync warning] Stage 1 merge warning: ${err.message}`);
  }

  // Stage 2: Project updates from project branch
  console.log(`[sync] Stage 2 (Project): Fetching & merging updates from ${projectBranch}...`);
  try {
    runGit(`fetch origin ${projectBranch}`);
    runGit(`merge origin/${projectBranch} --no-edit`);
    console.log(`[sync] Stage 2 (Project): Updated successfully!`);
  } catch {
    console.log(`[sync] Remote branch origin/${projectBranch} not found on origin or already up to date.`);
  }

  console.log('[sync] 2-stage pull completed successfully!');
}

function executePush(message) {
  const config = getProjectConfig();
  if (!config || !config.projectBranch) {
    console.error('[sync] Error: Project profile not set. Run "sync.cjs project-set <branch> [skills...]" first.');
    process.exit(1);
  }

  const { projectBranch, projectSkills = [] } = config;
  console.log(`[sync] Starting 2-stage push for project: ${projectBranch}...`);

  ensureBranch(projectBranch);

  const statusRaw = runGit('status --porcelain');
  const lines = statusRaw.split('\n').filter(Boolean);
  const commonChanged = [];
  const projectChanged = [];

  for (const line of lines) {
    const file = line.slice(3).trim();
    const isProject = projectSkills.some(skill => file.startsWith(`skills/${skill}/`) || file === `skills/${skill}`);
    if (isProject) {
      projectChanged.push(file);
    } else {
      commonChanged.push(file);
    }
  }

  // Stage 1: Push common files to origin main
  console.log('[sync] Stage 1 (Common): Checking common changes for main branch...');
  if (commonChanged.length > 0) {
    console.log(`[sync] Found ${commonChanged.length} common file(s) changed. Syncing to main...`);
    const tempWorktree = path.join(CACHE_DIR, 'main-worktree');
    try {
      if (fs.existsSync(tempWorktree)) {
        try { runGit(`worktree remove --force "${tempWorktree}"`, { silent: true }); } catch {}
        fs.rmSync(tempWorktree, { recursive: true, force: true });
      }
      runGit('fetch origin main');
      runGit(`worktree add --detach "${tempWorktree}" origin/main`);

      for (const relFile of commonChanged) {
        const srcPath = path.join(AGENTS_DIR, relFile);
        const destPath = path.join(tempWorktree, relFile);
        if (fs.existsSync(srcPath)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
        } else if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
      }

      const wtGit = (args) => {
        const gitDir = path.join(AGENTS_DIR, '.git');
        return execSync(`git --git-dir="${gitDir}" --work-tree="${tempWorktree}" ${args}`, {
          encoding: 'utf-8',
          cwd: tempWorktree
        });
      };

      wtGit('add .');
      const wtStatus = wtGit('status --porcelain').trim();
      if (wtStatus) {
        wtGit(`commit -m "[common] ${message}"`);
        wtGit('push origin HEAD:main');
        try { runGit('branch -f main HEAD'); } catch {}
        console.log('[sync] Stage 1 (Common): Pushed common changes to origin/main!');
      } else {
        console.log('[sync] Stage 1 (Common): No actual diff in common files against origin/main.');
      }
    } catch (err) {
      console.error(`[sync err] Stage 1 push failed: ${err.message}`);
    } finally {
      try { runGit(`worktree remove --force "${tempWorktree}"`, { silent: true }); } catch {}
      if (fs.existsSync(tempWorktree)) {
        fs.rmSync(tempWorktree, { recursive: true, force: true });
      }
    }

    try {
      runGit('merge main --no-edit');
    } catch {}
  } else {
    console.log('[sync] Stage 1 (Common): No common files changed.');
  }

  // Stage 2: Push project files to origin <projectBranch>
  console.log(`[sync] Stage 2 (Project): Checking project changes for ${projectBranch}...`);
  runGit('add .');
  const projStatus = runGit('status --porcelain').trim();
  if (projStatus) {
    runGit(`commit -m "[${projectBranch}] ${message}"`);
    runGit(`push -u origin ${projectBranch}`);
    console.log(`[sync] Stage 2 (Project): Pushed project changes to origin/${projectBranch}!`);
  } else {
    try {
      runGit(`push -u origin ${projectBranch}`);
      console.log(`[sync] Stage 2 (Project): Pushed pending commits to origin/${projectBranch}!`);
    } catch {
      console.log(`[sync] Stage 2 (Project): Branch origin/${projectBranch} is already up to date.`);
    }
  }

  console.log('[sync] 2-stage push completed successfully!');
}

ensureParentGitignore();
ensureAgentGitignore();
initGitIfNeeded();

const action = process.argv[2] || 'status';

if (action === 'branches') {
  const branches = getRemoteBranches();
  console.log(JSON.stringify(branches));
} else if (action === 'skills') {
  const skills = getAvailableSkills();
  console.log(JSON.stringify(skills));
} else if (action === 'project-get') {
  const config = getProjectConfig();
  if (config) {
    console.log(JSON.stringify(config));
  } else {
    console.log(JSON.stringify({ error: 'NOT_CONFIGURED' }));
  }
} else if (action === 'project-set') {
  const branch = process.argv[3];
  if (!branch) {
    console.error('[sync] Error: Branch name is required. Usage: project-set <branch> [skill1,skill2,...]');
    process.exit(1);
  }
  const skillsRaw = process.argv.slice(4).join(',');
  const skills = skillsRaw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const config = setProjectConfig(branch, skills);
  ensureBranch(branch);
  console.log(`[sync] Project set: branch "${branch}", skills: [${config.projectSkills.join(', ')}]`);
  console.log(JSON.stringify(config));
} else if (action === 'project-reset') {
  resetProjectConfig();
  console.log('[sync] Project profile reset.');
} else if (action === 'pull') {
  executePull();
} else if (action === 'push') {
  const message = process.argv.slice(3).join(' ') || 'Update agent config & skills';
  executePush(message);
} else if (action === 'status') {
  const config = getProjectConfig();
  const currentBranch = getCurrentBranch();
  console.log('[sync status]');
  console.log(`Current branch: ${currentBranch || 'unknown'}`);
  if (config) {
    console.log(`Saved project: branch "${config.projectBranch}", skills: [${config.projectSkills.join(', ')}]`);
  } else {
    console.log('Saved project: None (not configured).');
  }
  const status = runGit('status --short');
  if (status && status.trim()) {
    console.log(status.trim());
  } else {
    console.log('Clean. Local .agents working tree has no uncommitted changes.');
  }
} else {
  console.error('[sync] Unknown action. Use "branches", "skills", "project-get", "project-set", "project-reset", "pull", "push", or "status".');
  process.exit(1);
}


