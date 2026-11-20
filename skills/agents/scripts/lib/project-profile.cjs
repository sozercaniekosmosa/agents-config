/**
 * Project profile cache for the agents skill.
 * Stores the branch <-> skills classification used by the 2-stage pull/push.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_COMMON_SKILLS = ['check', 'debug', 'explorer', 'guide', 'observer', 'resolve', 'short', 'agents'];

function createProjectProfile({ agentsDir, cacheDir, runGit }) {
  const configFile = path.join(cacheDir, 'project.json');
  const skillsDir = path.join(agentsDir, 'skills');

  function getAvailableSkills() {
    if (!fs.existsSync(skillsDir)) return [];
    return fs.readdirSync(skillsDir).filter((name) => fs.statSync(path.join(skillsDir, name)).isDirectory());
  }

  function getRemoteCommonSkills() {
    try {
      const raw = runGit('ls-tree --name-only origin/main skills/', { silent: true });
      return raw
        .trim()
        .split('\n')
        .map((line) => line.replace(/^skills\//, '').trim())
        .filter(Boolean)
        .map((name) => (name === 'initialization' ? 'agents' : name));
    } catch {
      return DEFAULT_COMMON_SKILLS;
    }
  }

  function getUnclassifiedSkills(config) {
    if (!config) return [];
    const projectSkills = config.projectSkills || [];
    const commonSkills = Array.isArray(config.commonSkills) ? config.commonSkills : getRemoteCommonSkills();
    const known = new Set([...projectSkills, ...commonSkills]);
    return getAvailableSkills().filter((skill) => !known.has(skill));
  }

  function writeConfig(config) {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    config.unclassifiedSkills = getUnclassifiedSkills(config);
    return config;
  }

  function getProjectConfig() {
    if (!fs.existsSync(configFile)) return null;
    try {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      config.unclassifiedSkills = getUnclassifiedSkills(config);
      return config;
    } catch {
      return null;
    }
  }

  function setProjectConfig(branch, skills = [], commonSkills = null) {
    const allSkills = getAvailableSkills();
    const projSkills = Array.isArray(skills) ? skills : [skills].filter(Boolean);
    const commSkills = commonSkills !== null
      ? (Array.isArray(commonSkills) ? commonSkills : [commonSkills].filter(Boolean))
      : allSkills.filter((s) => !projSkills.includes(s));

    return writeConfig({
      projectBranch: branch,
      projectSkills: projSkills.sort(),
      commonSkills: commSkills.sort(),
      updatedAt: new Date().toISOString()
    });
  }

  function classifySkill(skill, type) {
    const config = getProjectConfig();
    if (!config || !config.projectBranch) {
      console.error('[sync] Error: Project profile not set. Run "sync.cjs project-set <branch> [skills...]" first.');
      process.exit(1);
    }
    if (!getAvailableSkills().includes(skill)) {
      console.error(`[sync] Error: Skill "${skill}" does not exist in .agents/skills/`);
      process.exit(1);
    }

    const projectSkills = new Set(config.projectSkills || []);
    const commonSkills = new Set(Array.isArray(config.commonSkills) ? config.commonSkills : getRemoteCommonSkills());

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

    return writeConfig({
      projectBranch: config.projectBranch,
      projectSkills: Array.from(projectSkills).sort(),
      commonSkills: Array.from(commonSkills).sort(),
      updatedAt: new Date().toISOString()
    });
  }

  function resetProjectConfig() {
    if (!fs.existsSync(configFile)) return false;
    fs.unlinkSync(configFile);
    return true;
  }

  function getRemoteBranches() {
    try {
      const raw = runGit('ls-remote --heads origin', { silent: true });
      const branches = [];
      for (const line of raw.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts[1] && parts[1].startsWith('refs/heads/')) {
          const branch = parts[1].replace('refs/heads/', '');
          if (branch !== 'main') branches.push(branch);
        }
      }
      return branches;
    } catch {
      return [];
    }
  }

  function getCurrentBranch() {
    try {
      return runGit('branch --show-current', { silent: true }).trim();
    } catch {
      return '';
    }
  }

  return {
    getAvailableSkills,
    getRemoteCommonSkills,
    getUnclassifiedSkills,
    getProjectConfig,
    setProjectConfig,
    classifySkill,
    resetProjectConfig,
    getRemoteBranches,
    getCurrentBranch
  };
}

module.exports = { createProjectProfile, DEFAULT_COMMON_SKILLS };
