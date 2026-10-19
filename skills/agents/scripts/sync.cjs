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

function getRemoteCommonSkills() {
  try {
    const raw = runGit('ls-tree --name-only origin/main skills/', { silent: true });
    return raw
      .trim()
      .split('\n')
      .map(line => line.replace(/^skills\//, '').trim())
      .filter(Boolean)
      .map(name => (name === 'initialization' ? 'agents' : name));
  } catch {
    return ['check', 'debug', 'explorer', 'guide', 'observer', 'resolve', 'short', 'agents'];
  }
}

function getUnclassifiedSkills(config) {
  if (!config) return [];
  const allSkills = getAvailableSkills();
  const projectSkills = config.projectSkills || [];
  let commonSkills = config.commonSkills;
  if (!Array.isArray(commonSkills)) {
    commonSkills = getRemoteCommonSkills();
  }
  const known = new Set([...projectSkills, ...commonSkills]);
  return allSkills.filter(s => !known.has(s));
}

function getProjectConfig() {
  if (fs.existsSync(PROJECT_CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(PROJECT_CONFIG_FILE, 'utf-8'));
      config.unclassifiedSkills = getUnclassifiedSkills(config);
      return config;
    } catch {
      return null;
    }
  }
  return null;
}

function setProjectConfig(branch, skills = [], commonSkills = null) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const allSkills = getAvailableSkills();
  const projSkills = Array.isArray(skills) ? skills : [skills].filter(Boolean);
  const commSkills = commonSkills !== null
    ? (Array.isArray(commonSkills) ? commonSkills : [commonSkills].filter(Boolean))
    : allSkills.filter(s => !projSkills.includes(s));

  const config = {
    projectBranch: branch,
    projectSkills: projSkills.sort(),
    commonSkills: commSkills.sort(),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(PROJECT_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  config.unclassifiedSkills = getUnclassifiedSkills(config);
  return config;
}

function classifySkill(skill, type) {
  const config = getProjectConfig();
  if (!config || !config.projectBranch) {
    console.error('[sync] Error: Project profile not set. Run "sync.cjs project-set <branch> [skills...]" first.');
    process.exit(1);
  }
  const allSkills = getAvailableSkills();
  if (!allSkills.includes(skill)) {
    console.error(`[sync] Error: Skill "${skill}" does not exist in .agents/skills/`);
    process.exit(1);
  }

  let projectSkills = new Set(config.projectSkills || []);
  let commonSkills = new Set(Array.isArray(config.commonSkills) ? config.commonSkills : getRemoteCommonSkills());

  if (type === 'project') {
    projectSkills.add(skill);
    commonSkills.delete(skill);
  } else if (type === 'common') {
    commonSkills.add(skill);
    projectSkills.delete(skill);
  } else {
    console.error(`[sync] Error: Type must be "common" or "project", got "${type}"`);
    process.exit(1);
  }

  config.projectSkills = Array.from(projectSkills).sort();
  config.commonSkills = Array.from(commonSkills).sort();
  config.updatedAt = new Date().toISOString();

  fs.writeFileSync(PROJECT_CONFIG_FILE, JSON.stringify({
    projectBranch: config.projectBranch,
    projectSkills: config.projectSkills,
    commonSkills: config.commonSkills,
    updatedAt: config.updatedAt
  }, null, 2), 'utf-8');

  config.unclassifiedSkills = getUnclassifiedSkills(config);
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

function runArchCheck() {
  const archCheckScript = path.join(AGENTS_DIR, 'skills/check/arch-check.cjs');
  if (fs.existsSync(archCheckScript)) {
    try {
      execSync(`node "${archCheckScript}"`, { cwd: AGENTS_DIR, stdio: 'pipe' });
    } catch (err) {
      const isForce = process.argv.includes('--force') || process.argv.includes('-f') || process.argv.includes('--no-verify');
      if (isForce) {
        console.warn('[sync Quality Gate warning] arch-check.cjs detected host project issues. Continuing with push (--no-verify).');
      } else {
        console.error('[sync Quality Gate] arch-check.cjs failed! Aborting push (use --no-verify to bypass host project issues).');
        if (err.stdout) console.log(err.stdout.toString());
        if (err.stderr) console.error(err.stderr.toString());
        process.exit(1);
      }
    }
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

  const statusRaw = runGit('status --porcelain', { silent: true }).trim();
  if (statusRaw) {
    console.error('[sync] Error: Working tree has uncommitted changes. Commit or stash before pulling.');
    process.exit(1);
  }

  // Stage 1: Common updates from main
  console.log('[sync] Stage 1 (Common): Fetching & merging updates from main...');
  try {
    runGit('fetch origin main', { silent: true });
    runGit('merge origin/main --no-edit -X no-renames', { silent: true });
    console.log('[sync] Stage 1 (Common): Updated successfully!');
  } catch (err) {
    console.warn(`[sync warning] Stage 1 merge warning: ${err.message}`);
  }

  // Stage 2: Project updates from project branch
  console.log(`[sync] Stage 2 (Project): Fetching & merging updates from ${projectBranch}...`);
  try {
    runGit(`fetch origin ${projectBranch}`, { silent: true });
    runGit(`merge origin/${projectBranch} --no-edit -X no-renames`, { silent: true });
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

  const unclassified = getUnclassifiedSkills(config);
  if (unclassified.length > 0) {
    console.error(`[sync Quality Gate] Found unclassified skill(s): [${unclassified.join(', ')}].`);
    console.error('[sync Quality Gate] Classify each skill as common or project before push:');
    console.error('       node .agents/skills/agents/scripts/sync.cjs classify <skill> <common|project>');
    process.exit(1);
  }

  runArchCheck();

  const { projectBranch, projectSkills = [] } = config;
  console.log(`[sync] Starting 2-stage push for project: ${projectBranch}...`);

  ensureBranch(projectBranch);

  // 1. Commit uncommitted changes on project branch if any
  const statusRaw = runGit('status --porcelain', { silent: true }).trim();
  if (statusRaw) {
    runGit('add .');
    runGit(`commit -m "[${projectBranch}] ${message}"`);
    console.log(`[sync] Committed uncommitted changes on ${projectBranch}.`);
  }

  // 2. Stage 1: Common files sync to origin main
  console.log('[sync] Stage 1 (Common): Checking common changes for main branch...');
  runGit('fetch origin main', { silent: true });

  const tempWorktree = path.join(CACHE_DIR, 'main-worktree');
  try {
    if (fs.existsSync(tempWorktree)) {
      try { runGit(`worktree remove --force "${tempWorktree}"`, { silent: true }); } catch {}
      fs.rmSync(tempWorktree, { recursive: true, force: true });
    }

    if (projectSkills.length === 0) {
      // All skills are common! Check if projectBranch has commits ahead of origin/main
      const aheadCount = parseInt(runGit(`rev-list --count origin/main..${projectBranch}`, { silent: true }).trim(), 10) || 0;
      if (aheadCount > 0) {
        console.log(`[sync] ${projectBranch} has ${aheadCount} commit(s) ahead of origin/main (all skills common). Syncing to main...`);
        runGit(`worktree add --detach "${tempWorktree}" origin/main`);
        const wtGit = (args) => {
          return execSync(`git ${args}`, {
            encoding: 'utf-8',
            cwd: tempWorktree
          });
        };
        wtGit(`merge ${projectBranch} -m "[common] ${message}"`);
        wtGit('push origin HEAD:main');
        try {
          runGit('fetch origin main', { silent: true });
          runGit('branch -f main origin/main', { silent: true });
        } catch {}
        console.log('[sync] Stage 1 (Common): Pushed common changes to origin/main!');
      } else {
        console.log('[sync] Stage 1 (Common): origin/main is already up to date with common changes.');
      }
    } else {
      // Project has specific skills -> find common files that differ between origin/main and projectBranch
      const diffFilesRaw = runGit(`diff --name-only origin/main...${projectBranch}`, { silent: true }).trim();
      const allChangedFiles = diffFilesRaw ? diffFilesRaw.split('\n').filter(Boolean) : [];
      const commonChanged = allChangedFiles.filter(file => {
        return !projectSkills.some(skill => file.startsWith(`skills/${skill}/`) || file === `skills/${skill}`);
      });

      if (commonChanged.length > 0) {
        console.log(`[sync] Found ${commonChanged.length} common file(s) changed. Syncing to main...`);
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
          return execSync(`git ${args}`, {
            encoding: 'utf-8',
            cwd: tempWorktree
          });
        };

        wtGit('add .');
        const wtStatus = wtGit('status --porcelain').trim();
        if (wtStatus) {
          wtGit(`commit -m "[common] ${message}"`);
          wtGit('push origin HEAD:main');
          try {
            runGit('fetch origin main', { silent: true });
            runGit('branch -f main origin/main', { silent: true });
          } catch {}
          console.log('[sync] Stage 1 (Common): Pushed common changes to origin/main!');
        } else {
          console.log('[sync] Stage 1 (Common): No actual diff in common files against origin/main.');
        }
      } else {
        console.log('[sync] Stage 1 (Common): No common files changed.');
      }
    }
  } catch (err) {
    console.error(`[sync err] Stage 1 push failed: ${err.message}`);
  } finally {
    try { runGit(`worktree remove --force "${tempWorktree}"`, { silent: true }); } catch {}
    if (fs.existsSync(tempWorktree)) {
      fs.rmSync(tempWorktree, { recursive: true, force: true });
    }
  }

  // 3. Stage 2: Push project branch
  console.log(`[sync] Stage 2 (Project): Checking project changes for ${projectBranch}...`);
  try {
    runGit(`push -u origin ${projectBranch}`);
    console.log(`[sync] Stage 2 (Project): Pushed branch to origin/${projectBranch}!`);
  } catch (err) {
    console.error(`[sync err] Stage 2 push failed: ${err.message}`);
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
} else if (action === 'unclassified') {
  const config = getProjectConfig();
  const unclassified = getUnclassifiedSkills(config);
  console.log(JSON.stringify(unclassified));
} else if (action === 'classify') {
  const skill = process.argv[3];
  const type = process.argv[4];
  if (!skill || !type) {
    console.error('[sync] Error: skill name and type (common|project) are required. Usage: classify <skill> <common|project>');
    process.exit(1);
  }
  const config = classifySkill(skill, type);
  console.log(`[sync] Classified "${skill}" as ${type}.`);
  console.log(JSON.stringify(config));
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
    if (config.commonSkills) {
      console.log(`Common skills: [${config.commonSkills.join(', ')}]`);
    }
    const unclassified = getUnclassifiedSkills(config);
    if (unclassified.length > 0) {
      console.log(`⚠️  Unclassified skills: [${unclassified.join(', ')}] (run: classify <skill> <common|project>)`);
    }
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
  console.error('[sync] Unknown action. Use "branches", "skills", "project-get", "project-set", "project-reset", "unclassified", "classify", "pull", "push", or "status".');
  process.exit(1);
}


