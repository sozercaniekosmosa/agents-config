#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const coreDir = __dirname;
const scriptsDir = path.resolve(coreDir, '..');
const observerSkillDir = path.resolve(scriptsDir, '..');
const skillsDir = path.resolve(observerSkillDir, '..');
const agentsDir = path.resolve(skillsDir, '..');
const workspaceRoot = path.resolve(agentsDir, '..');
const evolutionFile = path.join(agentsDir, '.cache', 'evolution.json');
const configFile = path.join(agentsDir, 'observer.config.json');

const DEFAULT_CONFIG = {
  requestThreshold: 10,
  hoursThreshold: 2,
  debtAgeThresholdDays: 7,
  maxSkillLines: 350,
  patternThresholdForCreate: 3,
  skillFrictionThreshold: 2,
  pruneRetentionDays: 90,
};

function loadObserverConfig() {
  if (fs.existsSync(configFile)) {
    try {
      const custom = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return { ...DEFAULT_CONFIG, ...custom };
    } catch (_) {}
  }
  return DEFAULT_CONFIG;
}

const skillAliases = {
  'initialization': 'agents',
  'init': 'agents',
  'agents-config': 'agents',
  'telemetry': 'observer',
  'telemetry-refactor': 'observer',
};

const domainCoverageMatrix = {
  'spec': 'guide',
  'contract': 'guide',
  'architecture-map': 'guide',
  'guide': 'guide',
  'rules': 'agents',
  'agents': 'agents',
  'sync': 'agents',
  'identity': 'agents',
  'lint': 'check',
  'types': 'check',
  'quality': 'check',
  'check': 'check',
  'debug': 'debug',
  'error': 'debug',
  'log': 'debug',
  'pocket': 'pocket',
  'storage': 'pocket',
  'resolve': 'resolve',
  'task': 'resolve',
  'explorer': 'explorer',
  'short': 'short',
  'loop': 'loop',
  'cycle': 'loop',
  'pair': 'loop',
};

const archivedSkills = ['pak'];

function getKnownSkills() {
  if (!fs.existsSync(skillsDir)) return new Set();
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()));
}

function resolveValidSkill(rawSkill) {
  if (!rawSkill) return null;
  const trimmed = rawSkill.trim().toLowerCase();
  if (!trimmed || trimmed === 'none') return null;

  const aliased = skillAliases[trimmed] || trimmed;
  const known = getKnownSkills();
  if (known.has(aliased)) return aliased;

  const mapped = domainCoverageMatrix[aliased] || domainCoverageMatrix[trimmed];
  if (mapped && known.has(mapped)) return mapped;

  return null;
}

function getSkillMetadata(skillName) {
  const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return { type: 'procedural' };
  try {
    const content = fs.readFileSync(skillFile, 'utf8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      const typeMatch = frontmatterMatch[1].match(/^type:\s*([a-zA-Z0-9_-]+)/m);
      if (typeMatch) {
        return { type: typeMatch[1].trim().toLowerCase() };
      }
    }
  } catch (_) {}
  return { type: 'procedural' };
}

function getBranchConfigSkills() {
  const projectConfigFile = path.join(agentsDir, '.cache', 'project.json');
  if (fs.existsSync(projectConfigFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(projectConfigFile, 'utf8'));
      return Array.isArray(data.skills) ? data.skills : [];
    } catch (_) {}
  }
  return [];
}

function categorizeIntent(rawIntent) {
  const clean = (rawIntent || 'general').trim().toLowerCase();
  const categories = [
    { prefix: 'pocket', patterns: [/\bpocket\b/, /\bпакет\b/, /\bархив\b/] },
    { prefix: 'agents', patterns: [/\bagents\b/, /\binitialization\b/, /\bправил/, /\bskill\b/] },
    { prefix: 'git', patterns: [/\bgit\b/, /\bpr\b/, /\bpush\b/, /\bpull\b/, /\bcommit\b/] },
    { prefix: 'graph', patterns: [/\bgraph\b/, /\bnode\b/, /\bbeat\b/, /\bcanvas\b/, /\bcentering\b/] },
    { prefix: 'tree', patterns: [/\btree\b/] },
    { prefix: 'store', patterns: [/\bstore\b/, /\bstate\b/, /\bzustand\b/] },
    { prefix: 'spec', patterns: [/\bguide\b/, /\bspec\b/, /\bcontract\b/, /\bдокументац/] },
    { prefix: 'check', patterns: [/\bcheck\b/, /\blint\b/, /\btsc\b/, /\bаудит\b/] },
    { prefix: 'debug', patterns: [/\bdebug\b/, /\bдиагностик/, /\blog\b/, /\bошибк/] },
    { prefix: 'resolve', patterns: [/\bresolve\b/, /\bреал/, /\bзадач/] },
    { prefix: 'storage', patterns: [/\bstorage\b/, /\bindexeddb\b/, /\blocalstorage\b/] },
    { prefix: 'table', patterns: [/\btable\b/, /\bfilter\b/, /\bmodal\b/] },
    { prefix: 'loop', patterns: [/\bloop\b/, /\bцикл\b/, /\bконвейер\b/] },
  ];

  for (const cat of categories) {
    if (clean.startsWith(`${cat.prefix}:`) || clean === cat.prefix) {
      return clean.replace(/\s+/g, '-');
    }
    if (cat.patterns.some((p) => p.test(clean))) {
      const sub = clean.replace(/[^a-z0-9а-яё_-]+/gi, '-').replace(/^-+|-+$/g, '');
      return `${cat.prefix}:${sub || 'action'}`;
    }
  }
  return clean.replace(/\s+/g, '-');
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`);
  const serialized = JSON.stringify(data);
  fs.writeFileSync(tempPath, serialized, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function loadEvolution() {
  if (!fs.existsSync(evolutionFile)) {
    const initial = {
      $schema: 'evolution-ledger',
      version: '1.0.0',
      telemetry: {
        lastAudit: new Date().toISOString(),
        requestCount: 0,
        patterns: {},
        skillUsage: {},
        skillFriction: {},
      },
      history: [],
    };
    atomicWriteJson(evolutionFile, initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(evolutionFile, 'utf8');
    const data = JSON.parse(raw);
    if (!data.telemetry) {
      data.telemetry = {
        lastAudit: new Date().toISOString(),
        requestCount: 0,
        patterns: {},
        skillUsage: {},
        skillFriction: {},
      };
    }
    if (!data.telemetry.skillFriction) data.telemetry.skillFriction = {};
    if (!data.history) data.history = [];
    return data;
  } catch (err) {
    try {
      if (fs.existsSync(evolutionFile) && fs.statSync(evolutionFile).size > 0) {
        const corruptedBackup = path.join(agentsDir, `evolution.corrupted.${Date.now()}.json`);
        fs.copyFileSync(evolutionFile, corruptedBackup);
        console.error(`[OBSERVER CRITICAL ERROR] evolution.json is corrupted (${err.message}). Backup saved to ${path.relative(workspaceRoot, corruptedBackup)}`);
      }
    } catch (_) {}
    return {
      $schema: 'evolution-ledger',
      version: '1.0.0',
      telemetry: {
        lastAudit: new Date().toISOString(),
        requestCount: 0,
        patterns: {},
        skillUsage: {},
        skillFriction: {},
      },
      history: [],
    };
  }
}

function saveEvolution(data) {
  atomicWriteJson(evolutionFile, data);
}

function checkAutoResolveIncident() {
  const evolution = loadEvolution();
  const incident = evolution.telemetry?.lastIncident;
  if (!incident || !incident.targetSkill) return false;

  const skillFile = path.join(skillsDir, incident.targetSkill.toLowerCase(), 'SKILL.md');
  if (fs.existsSync(skillFile)) {
    const stat = fs.statSync(skillFile);
    const incidentTime = new Date(incident.timestamp).getTime();
    if (stat.mtimeMs > incidentTime) {
      console.log(`[OBSERVER JIT] Auto-resolved active incident for skill "${incident.targetSkill}" (spec updated).`);
      evolution.telemetry.lastIncident = null;
      saveEvolution(evolution);
      return true;
    }
  }
  return false;
}

function record(intent, skill, frictionCount = 0, frictionType = 'syntax') {
  checkAutoResolveIncident();
  const config = loadObserverConfig();
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  telemetry.requestCount = (telemetry.requestCount || 0) + 1;
  if (!telemetry.skillFriction) telemetry.skillFriction = {};

  const normalizedIntent = categorizeIntent(intent);
  if (!telemetry.patterns[normalizedIntent]) {
    telemetry.patterns[normalizedIntent] = {
      count: 0,
      lastSeen: new Date().toISOString(),
      frictionCount: 0,
      weightedFriction: 0,
    };
  }
  telemetry.patterns[normalizedIntent].count += 1;
  telemetry.patterns[normalizedIntent].lastSeen = new Date().toISOString();

  const friction = Number(frictionCount) || 0;
  const frictionWeights = { syntax: 1, contract: 2, revert: 3 };
  const fWeight = frictionWeights[frictionType] || 1;
  const weightedFriction = friction * fWeight;

  telemetry.patterns[normalizedIntent].frictionCount += friction;
  telemetry.patterns[normalizedIntent].weightedFriction =
    (telemetry.patterns[normalizedIntent].weightedFriction || 0) + weightedFriction;

  // Split multi-skills (e.g. "initialization & check" or "guide, debug")
  const rawParts = (skill && skill !== 'none') ? skill.split(/[,&+/]+/) : [];
  const targetSkills = [];
  const rejectedEntities = [];

  for (const part of rawParts) {
    const valid = resolveValidSkill(part);
    if (valid) {
      if (!targetSkills.includes(valid)) targetSkills.push(valid);
    } else {
      const clean = part.trim();
      if (clean && clean !== 'none') rejectedEntities.push(clean);
    }
  }

  for (const s of targetSkills) {
    telemetry.skillUsage[s] = (telemetry.skillUsage[s] || 0) + 1;
    if (friction > 0) {
      telemetry.skillFriction[s] = (telemetry.skillFriction[s] || 0) + friction;
    }
  }

  if (rejectedEntities.length > 0) {
    console.log(`[OBSERVER NOTICE] Filtered non-skill entities from skillUsage: ${rejectedEntities.join(', ')}`);
  }

  saveEvolution(evolution);
  const skillStr = targetSkills.length > 0 ? targetSkills.join(', ') : 'none';
  console.log(`[OBSERVER] Recorded intent "${normalizedIntent}" (Skill(s): ${skillStr}). Total req count: ${telemetry.requestCount}`);

  const hasHighPatternFriction = friction >= config.skillFrictionThreshold || telemetry.patterns[normalizedIntent].frictionCount >= config.skillFrictionThreshold;
  const hasHighSkillFriction = targetSkills.some((s) => (telemetry.skillFriction[s] || 0) >= config.skillFrictionThreshold);

  if (hasHighPatternFriction || hasHighSkillFriction) {
    const alertedTarget = targetSkills.find((s) => (telemetry.skillFriction[s] || 0) >= config.skillFrictionThreshold) || skillStr;
    telemetry.lastIncident = {
      timestamp: new Date().toISOString(),
      intent: normalizedIntent,
      targetSkill: alertedTarget,
      frictionCount: friction,
      weightedFriction,
      patternFriction: telemetry.patterns[normalizedIntent].frictionCount,
      action: `Proactively formulate a targeted diff for skill "${alertedTarget}" specification to eliminate friction.`,
    };
    console.log(`\n[JUST-IN-TIME PROACTIVE ALERT] High friction detected for "${normalizedIntent}" / skill "${alertedTarget}". Proactively formulate a targeted diff for skill "${alertedTarget}" to eliminate friction.\n`);
  }

  const now = Date.now();
  const last = new Date(telemetry.lastAudit || now).getTime();
  const diffHours = (now - last) / (1000 * 60 * 60);
  const auditRequired = (telemetry.requestCount >= config.requestThreshold) || (diffHours >= config.hoursThreshold);
  telemetry.auditRequired = auditRequired;

  saveEvolution(evolution);

  if (auditRequired) {
    console.log(`[OBSERVER NOTICE] Audit threshold reached (Requests: ${telemetry.requestCount}, Time: ${diffHours.toFixed(1)}h). Recommend running /observer or /check.`);
  }
}

function checkThresholds() {
  checkAutoResolveIncident();
  const config = loadObserverConfig();
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  const now = Date.now();
  const last = new Date(telemetry.lastAudit || now).getTime();
  const diffHours = (now - last) / (1000 * 60 * 60);

  const countThreshold = (telemetry.requestCount || 0) >= config.requestThreshold;
  const timeThreshold = diffHours >= config.hoursThreshold;

  const result = {
    triggered: countThreshold || timeThreshold,
    requestCount: telemetry.requestCount || 0,
    hoursSinceAudit: Number(diffHours.toFixed(2)),
    reasons: [],
  };

  if (countThreshold) result.reasons.push(`request_count_reached (>= ${config.requestThreshold})`);
  if (timeThreshold) result.reasons.push(`time_interval_reached (>= ${config.hoursThreshold}h)`);

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function cleanTelemetry(verbose = true) {
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  const known = getKnownSkills();
  let modified = false;
  const migrated = [];
  const removed = [];

  // 1. Sanitize skillUsage
  if (telemetry.skillUsage) {
    for (const [k, count] of Object.entries(telemetry.skillUsage)) {
      const lower = k.toLowerCase();
      const target = skillAliases[lower] || (known.has(lower) ? lower : domainCoverageMatrix[lower]);
      if (target && target !== k && known.has(target)) {
        telemetry.skillUsage[target] = (telemetry.skillUsage[target] || 0) + count;
        delete telemetry.skillUsage[k];
        migrated.push(`skillUsage: ${k} -> ${target} (+${count})`);
        modified = true;
      } else if (!target || !known.has(target)) {
        delete telemetry.skillUsage[k];
        removed.push(`skillUsage: ${k} (${count} calls)`);
        modified = true;
      }
    }
  }

  // 2. Sanitize skillFriction
  if (telemetry.skillFriction) {
    for (const [k, count] of Object.entries(telemetry.skillFriction)) {
      const lower = k.toLowerCase();
      const target = skillAliases[lower] || (known.has(lower) ? lower : domainCoverageMatrix[lower]);
      if (target && target !== k && known.has(target)) {
        telemetry.skillFriction[target] = (telemetry.skillFriction[target] || 0) + count;
        delete telemetry.skillFriction[k];
        migrated.push(`skillFriction: ${k} -> ${target} (+${count})`);
        modified = true;
      } else if (!target || !known.has(target)) {
        delete telemetry.skillFriction[k];
        removed.push(`skillFriction: ${k} (${count} frictions)`);
        modified = true;
      }
    }
  }

  if (modified) {
    saveEvolution(evolution);
    if (verbose) {
      console.log('[OBSERVER HYGIENE] Telemetry cleaned and sanitized:');
      migrated.forEach((m) => console.log(`  - Migrated: ${m}`));
      removed.forEach((r) => console.log(`  - Removed invalid non-skill: ${r}`));
    }
  } else if (verbose) {
    console.log('[OBSERVER HYGIENE] Telemetry is clean. No phantom skills or alias drifts found.');
  }

  return { modified, migrated, removed };
}

function pruneTelemetry(retentionDays = 90, verbose = true) {
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  const now = Date.now();
  const cutoffMs = Number(retentionDays) * 24 * 60 * 60 * 1000;
  const pruned = [];

  if (telemetry.patterns) {
    for (const [patternKey, stat] of Object.entries(telemetry.patterns)) {
      const lastSeenMs = new Date(stat.lastSeen || 0).getTime();
      const ageMs = now - lastSeenMs;
      if (ageMs > cutoffMs && (stat.count || 0) <= 1 && (stat.frictionCount || 0) === 0) {
        delete telemetry.patterns[patternKey];
        pruned.push(patternKey);
      }
    }
  }

  if (pruned.length > 0) {
    saveEvolution(evolution);
    if (verbose) {
      console.log(`[OBSERVER PRUNE] Pruned ${pruned.length} obsolete pattern(s) older than ${retentionDays} days:`);
      pruned.forEach((p) => console.log(`  - ${p}`));
    }
  } else if (verbose) {
    console.log(`[OBSERVER PRUNE] 0 obsolete patterns found older than ${retentionDays} days.`);
  }

  return { prunedCount: pruned.length, pruned };
}

function auditTelemetryHygiene(autoFix = true, verbose = true) {
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  const issues = [];
  let modified = false;

  // A. Sanitize base counters
  if (typeof telemetry.requestCount !== 'number' || isNaN(telemetry.requestCount) || telemetry.requestCount < 0) {
    issues.push(`Fixed invalid requestCount (${telemetry.requestCount} -> 0)`);
    telemetry.requestCount = 0;
    modified = true;
  }

  const lastAuditDate = new Date(telemetry.lastAudit);
  if (isNaN(lastAuditDate.getTime())) {
    const fixedDate = new Date().toISOString();
    issues.push(`Fixed invalid lastAudit timestamp (${telemetry.lastAudit} -> ${fixedDate})`);
    telemetry.lastAudit = fixedDate;
    modified = true;
  }

  // B. Sanitize patterns
  if (telemetry.patterns) {
    for (const [patternKey, stat] of Object.entries(telemetry.patterns)) {
      if (!patternKey || typeof patternKey !== 'string' || patternKey.trim() === '') {
        delete telemetry.patterns[patternKey];
        issues.push(`Removed malformed empty pattern key`);
        modified = true;
        continue;
      }
      if (typeof stat.count !== 'number' || isNaN(stat.count) || stat.count < 0) {
        issues.push(`Reset invalid count for pattern "${patternKey}" to 1`);
        stat.count = 1;
        modified = true;
      }
      if (typeof stat.frictionCount !== 'number' || isNaN(stat.frictionCount) || stat.frictionCount < 0) {
        issues.push(`Reset invalid frictionCount for pattern "${patternKey}" to 0`);
        stat.frictionCount = 0;
        modified = true;
      }
      const seenDate = new Date(stat.lastSeen);
      if (isNaN(seenDate.getTime())) {
        stat.lastSeen = new Date().toISOString();
        issues.push(`Fixed invalid lastSeen for pattern "${patternKey}"`);
        modified = true;
      }
    }
  }

  // C. Sanitize skillUsage and skillFriction via cleaner
  const cleanRes = cleanTelemetry(false);
  if (cleanRes.modified) {
    modified = true;
    cleanRes.migrated.forEach((m) => issues.push(`Migrated: ${m}`));
    cleanRes.removed.forEach((r) => issues.push(`Removed non-skill: ${r}`));
  }

  if (modified && autoFix) {
    saveEvolution(evolution);
  }

  if (issues.length > 0 && verbose) {
    console.log(`[OBSERVER HYGIENE] Detected and auto-repaired ${issues.length} telemetry schema anomaly(ies):`);
    issues.forEach((iss) => console.log(`  - ${iss}`));
  }

  return { healthy: issues.length === 0, issues };
}

function printLastIncident(jsonMode = false) {
  checkAutoResolveIncident();
  const evolution = loadEvolution();
  const incident = evolution.telemetry?.lastIncident;
  if (!incident) {
    if (jsonMode) {
      console.log(JSON.stringify({ hasIncident: false }, null, 2));
    } else {
      console.log('[OBSERVER JIT] No active high-friction incident recorded.');
    }
    return;
  }
  if (jsonMode) {
    console.log(JSON.stringify({ hasIncident: true, ...incident }, null, 2));
  } else {
    console.log('[OBSERVER JIT ACTIVE INCIDENT]');
    console.log(`- Time:       ${incident.timestamp}`);
    console.log(`- Intent:     ${incident.intent}`);
    console.log(`- Target:     ${incident.targetSkill}`);
    console.log(`- Friction:   ${incident.frictionCount} (Pattern total: ${incident.patternFriction})`);
    console.log(`- Action:     ${incident.action}`);
  }
}

function logHistory(scope, trigger, improvement) {
  if (!scope || !trigger || !improvement) {
    console.error('[OBSERVER ERROR] Использование: node observer.cjs --log-history <scope> <trigger> <improvement>');
    process.exit(1);
  }
  const evolution = loadEvolution();
  const today = new Date().toISOString().split('T')[0];
  evolution.history.push({
    date: today,
    scope,
    trigger,
    improvement,
  });
  saveEvolution(evolution);
  console.log(`[EVOLUTION LEDGER] Recorded: - [${today}] [${scope}] → [${trigger}] → [${improvement}]`);
}

function printHistory() {
  const evolution = loadEvolution();
  console.log('# Agent Skills Evolution Ledger (evolution.json)\n');
  if (!evolution.history || evolution.history.length === 0) {
    console.log('No history records found.');
    return;
  }
  for (const item of evolution.history) {
    console.log(`- [${item.date}] [${item.scope}] → [${item.trigger}] → [${item.improvement}]`);
  }
}

module.exports = {
  agentsDir,
  workspaceRoot,
  evolutionFile,
  skillsDir,
  configFile,
  DEFAULT_CONFIG,
  loadObserverConfig,
  skillAliases,
  domainCoverageMatrix,
  archivedSkills,
  getKnownSkills,
  resolveValidSkill,
  getSkillMetadata,
  getBranchConfigSkills,
  categorizeIntent,
  atomicWriteJson,
  loadEvolution,
  saveEvolution,
  checkAutoResolveIncident,
  record,
  checkThresholds,
  printLastIncident,
  cleanTelemetry,
  pruneTelemetry,
  auditTelemetryHygiene,
  logHistory,
  printHistory,
};
