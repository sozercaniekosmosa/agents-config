#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const agentsDir = path.resolve(__dirname, '../../..');
const workspaceRoot = path.resolve(agentsDir, '..');
const evolutionFile = path.join(agentsDir, 'evolution.json');
const skillsDir = path.join(agentsDir, 'skills');

const privateDomainPatterns = [
  /\bsrc\/components\/tree\b/i,
  /\bsrc\/components\/graph\b/i,
  /\btreeGraphLayout\b/i,
  /\bSceneContentEditor\b/i,
];

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
      },
      history: [],
    };
    fs.writeFileSync(evolutionFile, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const data = JSON.parse(fs.readFileSync(evolutionFile, 'utf8'));
    if (!data.telemetry) {
      data.telemetry = {
        lastAudit: new Date().toISOString(),
        requestCount: 0,
        patterns: {},
        skillUsage: {},
      };
    }
    if (!data.history) data.history = [];
    return data;
  } catch (_) {
    return {
      $schema: 'evolution-ledger',
      version: '1.0.0',
      telemetry: {
        lastAudit: new Date().toISOString(),
        requestCount: 0,
        patterns: {},
        skillUsage: {},
      },
      history: [],
    };
  }
}

function saveEvolution(data) {
  fs.writeFileSync(evolutionFile, JSON.stringify(data, null, 2), 'utf8');
}

function record(intent, skill, frictionCount = 0) {
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  telemetry.requestCount = (telemetry.requestCount || 0) + 1;

  const normalizedIntent = (intent || 'general').trim().toLowerCase().replace(/\s+/g, '-');
  if (!telemetry.patterns[normalizedIntent]) {
    telemetry.patterns[normalizedIntent] = {
      count: 0,
      lastSeen: new Date().toISOString(),
      frictionCount: 0,
    };
  }
  telemetry.patterns[normalizedIntent].count += 1;
  telemetry.patterns[normalizedIntent].lastSeen = new Date().toISOString();
  telemetry.patterns[normalizedIntent].frictionCount += Number(frictionCount) || 0;

  if (skill && skill !== 'none') {
    telemetry.skillUsage[skill] = (telemetry.skillUsage[skill] || 0) + 1;
  }

  saveEvolution(evolution);
  console.log(`[OBSERVER] Recorded intent "${normalizedIntent}" (Skill: ${skill || 'none'}). Total req count: ${telemetry.requestCount}`);
}

function checkThresholds() {
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  const now = Date.now();
  const last = new Date(telemetry.lastAudit || now).getTime();
  const diffHours = (now - last) / (1000 * 60 * 60);

  const countThreshold = (telemetry.requestCount || 0) >= 10;
  const timeThreshold = diffHours >= 2;

  const result = {
    triggered: countThreshold || timeThreshold,
    requestCount: telemetry.requestCount || 0,
    hoursSinceAudit: Number(diffHours.toFixed(2)),
    reasons: [],
  };

  if (countThreshold) result.reasons.push('request_count_reached (>= 10)');
  if (timeThreshold) result.reasons.push('time_interval_reached (>= 2h)');

  console.log(JSON.stringify(result, null, 2));
  return result;
}

// 1. Skill Linter & Generalization Audit (Zero Specificity Bias & Quality Guard)
function auditSkillsQuality() {
  const missingFeedbackSkills = [];
  const skillLintIssues = [];

  if (fs.existsSync(skillsDir)) {
    const skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of skillEntries) {
      if (entry.isDirectory()) {
        const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          const skillContent = fs.readFileSync(skillFile, 'utf8');
          const lines = skillContent.split(/\r?\n/);

          // A. Feedback Loop contract check
          if (!skillContent.includes('Feedback Loop') && !skillContent.includes('Петля Эволюции Навыка')) {
            missingFeedbackSkills.push(entry.name);
          }

          // B. Size / Token Budget check (>350 lines warning)
          if (lines.length > 350) {
            skillLintIssues.push(`[${entry.name}] Exceeds token budget (${lines.length} lines > 350 max). Consider compressing.`);
          }

          // Strip inline backticks and code fences to avoid false positives
          const contentWithoutCode = skillContent
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`\r\n]+`/g, '');

          // C. Absolute path detection
          if (contentWithoutCode.includes('file:///') || contentWithoutCode.match(/[a-zA-Z]:\\[a-zA-Z0-9_.-]+/)) {
            skillLintIssues.push(`[${entry.name}] Contains absolute file paths outside code blocks. Use relative paths only.`);
          }

          // D. Legacy XML tags detection
          const xmlMatch = contentWithoutCode.match(/<\/?(handoff_context|architecture_map|feature_status)[^>]*>/i);
          if (xmlMatch) {
            skillLintIssues.push(`[${entry.name}] Contains legacy XML tags (${xmlMatch[0]}). Format as clean Markdown.`);
          }

          // E. Zero Specificity Bias
          for (const pattern of privateDomainPatterns) {
            if (pattern.test(skillContent)) {
              skillLintIssues.push(`[${entry.name}] Contains project-specific domain reference (${pattern}). Generalize to architectural layer terms.`);
            }
          }
        } else {
          missingFeedbackSkills.push(`${entry.name} (missing SKILL.md)`);
        }
      }
    }
  }

  if (missingFeedbackSkills.length > 0) {
    console.warn('\n[SKILL AUDIT WARNING] Found skills lacking Feedback Loop mechanism (Zero Orphan Skills):');
    missingFeedbackSkills.forEach((s) => {
      console.warn(`  - .agents/skills/${s}/SKILL.md lacks Feedback Loop contract`);
    });
    console.warn('Add standard Feedback Loop section to onboard new skills into self-improvement cycle.\n');
  }

  if (skillLintIssues.length > 0) {
    console.warn('\n[SKILL LINT WARNING] Found skill quality or specificity issues:');
    skillLintIssues.forEach((issue) => console.warn(`  - ${issue}`));
    console.warn('');
  }
}

// 2. Troubleshooting Harvester (Anti-Pattern Aggregation)
function harvestTroubleshooting() {
  function scanTroubleshootingFiles(dir, list = []) {
    if (!fs.existsSync(dir)) return list;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', '.archives', '.tmp'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanTroubleshootingFiles(full, list);
      } else if (entry.isFile() && entry.name === 'TROUBLESHOOTING.md') {
        list.push(full);
      }
    }
    return list;
  }

  const troubleshootingFiles = scanTroubleshootingFiles(path.join(workspaceRoot, 'src'));
  const rootTroubleshooting = path.join(workspaceRoot, 'TROUBLESHOOTING.md');
  if (fs.existsSync(rootTroubleshooting)) troubleshootingFiles.push(rootTroubleshooting);

  if (troubleshootingFiles.length > 0) {
    let totalIncidents = 0;
    troubleshootingFiles.forEach((f) => {
      try {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().startsWith('- '));
        totalIncidents += lines.length;
      } catch (_) {}
    });
    if (totalIncidents > 0) {
      console.log(`[TROUBLESHOOTING HARVEST] Tracked ${totalIncidents} incidents across ${troubleshootingFiles.length} modules. Ensure recurring bugs are generalized into architecture rules.`);
    }
  }
}

// 3. Upstream Sync Health Hint
function checkUpstreamSync() {
  const agentsGitDir = path.join(workspaceRoot, '.agents', '.git');
  if (fs.existsSync(agentsGitDir)) {
    try {
      const status = execSync(
        `git --git-dir="${agentsGitDir}" --work-tree="${path.join(workspaceRoot, '.agents')}" status --porcelain`,
        { encoding: 'utf8' }
      ).trim();
      if (status) {
        console.log('\n[UPSTREAM SYNC NOTICE] Local skill improvements detected in .agents/. Consider publishing:');
        console.log('  node .agents/skills/initialization/scripts/sync.cjs push "description"\n');
      }
    } catch (_) {}
  }
}

function audit(resetCounters = true) {
  // 1. Audit skills specification quality and contracts
  auditSkillsQuality();

  // 2. Harvest recurring incidents from TROUBLESHOOTING.md
  harvestTroubleshooting();

  // 3. Check upstream git sync status
  checkUpstreamSync();

  // 4. Analyze request telemetry and thresholds
  const evolution = loadEvolution();
  const telemetry = evolution.telemetry;
  const recommendations = [];

  const existingSkills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir).filter((f) => fs.statSync(path.join(skillsDir, f)).isDirectory())
    : [];

  // Criteria: Creation
  for (const [intent, stat] of Object.entries(telemetry.patterns || {})) {
    const matchesSkill = existingSkills.some((s) => s.toLowerCase() === intent);
    if (!matchesSkill && stat.count >= 3) {
      recommendations.push({
        type: 'create',
        target: intent,
        reason: `Повторяющийся паттерн req (${stat.count} вызовов) без покрытия навыком.`,
        necessityMet: true,
        sufficiencyMet: true,
      });
    }
  }

  // Criteria: Modification
  for (const [intent, stat] of Object.entries(telemetry.patterns || {})) {
    if (stat.frictionCount >= 2) {
      recommendations.push({
        type: 'modify',
        target: intent,
        reason: `Зафиксированы системные трения/правки пользователя (${stat.frictionCount} раз).`,
        necessityMet: true,
        sufficiencyMet: true,
      });
    }
  }

  // Criteria: Deletion / Archival
  const totalCalls = Object.values(telemetry.skillUsage || {}).reduce((a, b) => a + b, 0);
  if (totalCalls >= 15) {
    for (const skill of existingSkills) {
      if (!telemetry.skillUsage[skill] || telemetry.skillUsage[skill] === 0) {
        recommendations.push({
          type: 'delete',
          target: skill,
          reason: `Навык не вызывался за период (${totalCalls} суммарных вызовов). Рекомендуется аудит на удаление/архивацию.`,
          necessityMet: true,
          sufficiencyMet: false,
        });
      }
    }
  }

  if (resetCounters) {
    telemetry.lastAudit = new Date().toISOString();
    telemetry.requestCount = 0;
    saveEvolution(evolution);
  }

  console.log('[OBSERVER AUDIT] Результаты анализа непрерывного улучшения:');
  if (recommendations.length === 0) {
    console.log('- Нет активных рекомендаций по изменению, созданию или удалению навыков.');
  } else {
    for (const rec of recommendations) {
      console.log(`- [${rec.type.toUpperCase()}] ${rec.target} → ${rec.reason}`);
    }
  }

  return recommendations;
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

function scaffold(skillName) {
  if (!skillName) {
    console.error('[OBSERVER ERROR] Укажите имя навыка: node observer.cjs --scaffold [name]');
    process.exit(1);
  }
  const targetDir = path.join(skillsDir, skillName.toLowerCase());
  const skillFile = path.join(targetDir, 'SKILL.md');

  if (fs.existsSync(skillFile)) {
    console.log(`[TELEMETRY] Навык ${skillName} уже существует: ${skillFile}`);
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const content = `---
name: ${skillName.toLowerCase()}
description: >
  Навык ${skillName.toLowerCase()} для выполнения специализированных задач.
  Триггеры: /${skillName.toLowerCase()}, "${skillName.toLowerCase()}".
---

# Навык ${skillName}

Описание назначения и регламента работы навыка.

---

## 🔑 Ключевые Принципы

1. **Принцип 1**: Четкие контракты вход/выход.
2. **Zero Dead Code**: Очистка неиспользуемого кода после завершения.

---

## 📋 Порядок Выполнения

1. **Анализ задачи**: входные данные и контекст.
2. **Реализация**: выполнение детерминированных шагов.
3. **Валидация**: проверка работоспособности.
4. **Петля Эволюции Навыка (Feedback Loop)**:
   - Анализ концептуальных сдвигов: проверить, затронуло ли выполнение базовые принципы навыка.
   - При выявлении новых паттернов или правок пользователя → предложить актуализацию спецификации (\`/learn\` или подтверждение в чате).
`;

  fs.writeFileSync(skillFile, content, 'utf8');
  console.log(`[TELEMETRY] Каркас навыка создан: ${path.relative(workspaceRoot, skillFile)}`);
}

// CLI args parsing
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`Использование:
  node observer.cjs --record <intent> [skill] [friction]
  node observer.cjs --check-thresholds
  node observer.cjs --audit
  node observer.cjs --history
  node observer.cjs --log-history <scope> <trigger> <improvement>
  node observer.cjs --scaffold <skill-name>`);
  process.exit(0);
}

switch (command) {
  case '--record':
    record(args[1], args[2], args[3]);
    break;
  case '--check-thresholds':
    checkThresholds();
    break;
  case '--audit':
    audit(true);
    break;
  case '--history':
    printHistory();
    break;
  case '--log-history':
    logHistory(args[1], args[2], args[3]);
    break;
  case '--scaffold':
    scaffold(args[1]);
    break;
  default:
    console.error(`Неизвестная команда: ${command}`);
    process.exit(1);
}
