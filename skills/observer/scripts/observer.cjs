#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const telemetry = require('./core/telemetry.cjs');
const harvester = require('./core/harvester.cjs');
const rules = require('./core/rules.cjs');

const {
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
} = telemetry;

const {
  privateDomainPatterns,
  slugify,
  auditSkillsQuality,
  harvestTroubleshooting,
  auditTechDebt,
  checkUpstreamSync,
} = harvester;

const {
  scanHooksOrder,
  scanRawDtoInUi,
  verifyRules,
  runPreCommit,
} = rules;

function audit(resetCounters = true, jsonMode = false) {
  // 0. Audit and repair telemetry schema hygiene
  const hygiene = auditTelemetryHygiene(true, !jsonMode);

  // 1. Audit skills specification quality and contracts
  const skillsQuality = auditSkillsQuality(!jsonMode);

  // 2. Harvest recurring incidents from TROUBLESHOOTING.md & synthesize rules
  const candidateRules = harvestTroubleshooting(!jsonMode);
  const ruleRecommendations = [];

  const projectRulesFile = path.join(workspaceRoot, 'docs', 'project-rules.md');
  const projectRulesContent = fs.existsSync(projectRulesFile) ? fs.readFileSync(projectRulesFile, 'utf8') : '';
  const projectRulesSlug = slugify(projectRulesContent);

  for (const rule of candidateRules) {
    const titleSlug = slugify(rule.title);
    if (!projectRulesContent.includes(rule.title) && !projectRulesSlug.includes(titleSlug)) {
      ruleRecommendations.push({
        type: 'rule',
        target: rule.title,
        reason: `Выявлен повторяющийся кластер дефектов (${rule.incidents} инцидентов).`,
        action: `Добавить правило в docs/project-rules.md: ${rule.proposedRule}`,
        necessityMet: true,
        sufficiencyMet: true,
        proposedRule: rule.proposedRule,
      });
    }
  }

  // 3. Audit aging items in technical debt ledger
  const debtAudit = auditTechDebt(!jsonMode);
  const debtRecommendations = debtAudit.recommendations;

  // 4. Verify codebase against synthesized architecture rules
  const ruleVerification = verifyRules(false);
  const codeFixRecommendations = [];
  if (!ruleVerification.passed) {
    for (const v of ruleVerification.violations) {
      codeFixRecommendations.push({
        type: 'fix-code',
        target: v.file,
        reason: `Нарушение архитектурного правила [${v.rule}]: line ${v.line}`,
        action: v.message,
        necessityMet: true,
        sufficiencyMet: true,
      });
    }
  }

  // 5. Check upstream git sync status
  checkUpstreamSync();

  // 6. Analyze request telemetry and thresholds
  const evolution = loadEvolution();
  const currentTelemetry = evolution.telemetry;
  const recommendations = [...debtRecommendations, ...ruleRecommendations, ...codeFixRecommendations];

  const existingSkills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir).filter((f) => fs.statSync(path.join(skillsDir, f)).isDirectory())
    : [];

  // Criteria: Creation
  for (const [intent, stat] of Object.entries(currentTelemetry.patterns || {})) {
    const baseIntent = intent.split(':')[0];
    const mappedSkill = domainCoverageMatrix[baseIntent] || domainCoverageMatrix[intent];
    const matchesSkill = existingSkills.some(
      (s) => s.toLowerCase() === intent || s.toLowerCase() === baseIntent || (mappedSkill && s.toLowerCase() === mappedSkill)
    );
    if (!matchesSkill && stat.count >= 3) {
      recommendations.push({
        type: 'create',
        target: intent,
        reason: `Повторяющийся паттерн req (${stat.count} вызовов) без покрытия навыком.`,
        action: `node .agents/skills/observer/scripts/observer.cjs --scaffold ${baseIntent}`,
        necessityMet: true,
        sufficiencyMet: true,
      });
    }
  }

  // Criteria: Modification
  for (const [intent, stat] of Object.entries(currentTelemetry.patterns || {})) {
    if (stat.frictionCount >= 2) {
      const baseIntent = intent.split(':')[0];
      const targetSkill = domainCoverageMatrix[baseIntent] || baseIntent;
      recommendations.push({
        type: 'modify',
        target: targetSkill,
        reason: `Зафиксированы системные трения/правки пользователя (${stat.frictionCount} раз) в паттерне ${intent}.`,
        action: `Обновить спецификацию .agents/skills/${targetSkill}/SKILL.md через /learn`,
        necessityMet: true,
        sufficiencyMet: true,
      });
    }
  }

  for (const [skill, fCount] of Object.entries(currentTelemetry.skillFriction || {})) {
    if (fCount >= 2 && !recommendations.some((r) => r.type === 'modify' && r.target === skill)) {
      recommendations.push({
        type: 'modify',
        target: skill,
        reason: `Зафиксированы суммарные трения по навыку (${fCount} раз). Рекомендуется обновление спецификации /learn.`,
        action: `Обновить спецификацию .agents/skills/${skill}/SKILL.md через /learn`,
        necessityMet: true,
        sufficiencyMet: true,
      });
    }
  }

  // Criteria: Deletion / Archival
  const branchSkills = getBranchConfigSkills();
  const totalCalls = Object.values(currentTelemetry.skillUsage || {}).reduce((a, b) => a + b, 0);
  if (totalCalls >= 15) {
    for (const skill of existingSkills) {
      if (archivedSkills.includes(skill) || branchSkills.includes(skill)) continue;
      const meta = getSkillMetadata(skill);
      if (meta.type === 'declarative' || meta.type === 'orchestrator' || meta.type === 'core') continue;

      // Grace period for newly onboarded skills (48h grace period)
      const skillPath = path.join(skillsDir, skill);
      if (fs.existsSync(skillPath)) {
        const ctime = fs.statSync(skillPath).ctimeMs;
        const ageHours = (Date.now() - ctime) / (1000 * 60 * 60);
        if (ageHours < 48) continue;
      }

      if (!currentTelemetry.skillUsage[skill] || currentTelemetry.skillUsage[skill] === 0) {
        recommendations.push({
          type: 'delete',
          target: skill,
          reason: `Навык не вызывался за период (${totalCalls} суммарных вызовов). Рекомендуется аудит на удаление/архивацию.`,
          action: `Архивировать в .archives/${skill} и удалить из .agents/skills/${skill}`,
          necessityMet: true,
          sufficiencyMet: false,
        });
      }
    }
  }

  if (resetCounters) {
    currentTelemetry.lastAudit = new Date().toISOString();
    currentTelemetry.requestCount = 0;
    currentTelemetry.auditRequired = false;
    currentTelemetry.lastIncident = null;
    saveEvolution(evolution);
  }

  if (jsonMode) {
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      healthy: hygiene.healthy,
      hygieneIssues: hygiene.issues,
      skillsQuality,
      candidateRules,
      debtRecommendations: debtRecommendations.map((d) => d.debtMeta).filter(Boolean),
      ruleVerification,
      recommendations,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    return jsonOutput;
  }

  console.log('[OBSERVER AUDIT] Результаты анализа непрерывного улучшения:');
  if (recommendations.length === 0) {
    console.log('- Нет активных рекомендаций по изменению, созданию или удалению навыков.');
  } else {
    for (const rec of recommendations) {
      const actionText = rec.action ? ` [Action: ${rec.action}]` : '';
      console.log(`- [${rec.type.toUpperCase()}] ${rec.target} → ${rec.reason}${actionText}`);
    }
  }

  return recommendations;
}

function generateReport(outputPath) {
  const evolution = loadEvolution();
  const vRes = verifyRules(false);
  const candRules = harvestTroubleshooting(false);
  const debtAudit = auditTechDebt(false);
  const debtRecs = debtAudit.recommendations;
  const skillsQual = auditSkillsQuality(false);
  const hygiene = auditTelemetryHygiene(false, false);

  const lines = [
    `# 📊 Observer Architecture & Evolution Quality Report`,
    `Generated at: ${new Date().toISOString()}`,
    ``,
    `## 1. Schema & Telemetry Health`,
    `- Status: ${hygiene.healthy ? '✅ HEALTHY' : '⚠️ ANOMALIES DETECTED'}`,
    `- Total Requests: ${evolution.telemetry?.requestCount || 0}`,
    `- Tracked Patterns: ${Object.keys(evolution.telemetry?.patterns || {}).length}`,
    ``,
    `## 2. Codebase Synthesized Rule Verification`,
    `- Status: ${vRes.passed ? '✅ 0 VIOLATIONS' : `❌ ${vRes.violations.length} VIOLATION(S)`}`,
  ];

  if (vRes.violations.length > 0) {
    lines.push(``, `### Violations:`);
    vRes.violations.forEach((v) => {
      lines.push(`- **${v.rule}**: \`${v.file}:${v.line}\` → ${v.message}`);
    });
  }

  lines.push(``, `## 3. Aging Technical Debt (>= 7 days)`);
  if (debtRecs.length === 0) {
    lines.push(`- No aging technical debt.`);
  } else {
    debtRecs.forEach((d) => {
      const meta = d.debtMeta || {};
      lines.push(`- [ ] **[${meta.scope || d.target}]** (${meta.ageDays}d old): ${meta.issue || d.reason} → \`${meta.remediation || d.action}\``);
    });
  }

  lines.push(``, `## 4. Synthesized Rule Candidates`);
  if (candRules.length === 0) {
    lines.push(`- 0 candidates pending.`);
  } else {
    candRules.forEach((c) => {
      lines.push(`- **${c.title}** (${c.incidents} incidents): ${c.proposedRule}`);
    });
  }

  lines.push(``, `## 5. Skills Quality & Contracts`);
  if (skillsQual.missingFeedbackSkills.length === 0 && skillsQual.skillLintIssues.length === 0) {
    lines.push(`- All skills comply with Feedback Loop and size/specificity rules.`);
  } else {
    skillsQual.missingFeedbackSkills.forEach((s) => lines.push(`- ⚠️ Missing Feedback Loop: \`${s}\``));
    skillsQual.skillLintIssues.forEach((issue) => lines.push(`- ⚠️ Lint: ${issue}`));
  }

  const reportContent = lines.join('\n') + '\n';
  const target = outputPath || path.join(workspaceRoot, 'OBSERVER_REPORT.md');
  fs.writeFileSync(target, reportContent, 'utf8');
  console.log(`[OBSERVER REPORT] Generated report at: ${path.relative(workspaceRoot, target)}`);
  return reportContent;
}

function scaffold(skillName) {
  if (!skillName) {
    console.error('[OBSERVER ERROR] Укажите имя навыка: node observer.cjs --scaffold [name]');
    process.exit(1);
  }
  const cleanName = skillName.toLowerCase();
  const targetDir = path.join(skillsDir, cleanName);
  const skillFile = path.join(targetDir, 'SKILL.md');
  const scriptsSubdir = path.join(targetDir, 'scripts');
  const scriptFile = path.join(scriptsSubdir, `${cleanName}.cjs`);

  if (fs.existsSync(skillFile)) {
    console.log(`[TELEMETRY] Навык ${skillName} уже существует: ${skillFile}`);
    return;
  }

  fs.mkdirSync(scriptsSubdir, { recursive: true });

  const content = `---
name: ${cleanName}
type: procedural
description: >
  Навык ${cleanName} для выполнения специализированных задач.
  Триггеры: /${cleanName}, "${cleanName}".
---

# Навык ${skillName}

Описание назначения и регламента работы навыка.

---

## 🔑 Ключевые Принципы

1. **Контракты Вход/Выход**: Четкая валидация входных данных и строгий типизированный вывод.
2. **Zero Dead Code**: Удаление неиспользуемых временных сущностей и остаточных файлов после завершения.

---

## 📋 Порядок Выполнения

1. **Анализ задачи**: валидация входных данных и контекста.
2. **Исполнение**: вызов скрипта \`node .agents/skills/${cleanName}/scripts/${cleanName}.cjs\`.
3. **Верификация**: проверка отсутствия регрессий и соблюдения правил.
4. **Петля Эволюции Навыка (Feedback Loop)**:
   - Анализ концептуальных сдвигов: проверить, затронуло ли выполнение базовые принципы навыка.
   - При выявлении новых паттернов или правок пользователя → предложить актуализацию спецификации (\`/learn\` или подтверждение в чате).
`;

  const scriptContent = `#!/usr/bin/env node

/**
 * CLI script for /${cleanName} skill
 */

const path = require('path');

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node ${cleanName}.cjs [options]');
    process.exit(0);
  }
  console.log('[${cleanName.toUpperCase()}] Execution completed successfully.');
}

if (require.main === module) {
  main();
}
`;

  fs.writeFileSync(skillFile, content, 'utf8');
  fs.writeFileSync(scriptFile, scriptContent, 'utf8');
  console.log(`[TELEMETRY] Каркас навыка создан: ${path.relative(workspaceRoot, skillFile)} и ${path.relative(workspaceRoot, scriptFile)}`);
}

function runCli() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const isStrict = args.includes('--strict');
  const cleanArgs = args.filter((a) => a !== '--json' && a !== '--strict');
  const command = cleanArgs[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`Использование:
    node observer.cjs --record <intent> [skill] [friction] [frictionType]
    node observer.cjs --check-thresholds
    node observer.cjs --audit [--json] [--strict]
    node observer.cjs --verify-rules [--json]
    node observer.cjs --incident [--json]
    node observer.cjs --history [--json]
    node observer.cjs --clean-telemetry [--json]
    node observer.cjs --prune-telemetry [days] [--json]
    node observer.cjs --pre-commit [--json]
    node observer.cjs --report [outputPath]
    node observer.cjs --log-history <scope> <trigger> <improvement>
    node observer.cjs --scaffold <skill-name>`);
    process.exit(0);
  }

  switch (command) {
    case '--record':
      record(cleanArgs[1], cleanArgs[2], cleanArgs[3], cleanArgs[4]);
      break;
    case '--check-thresholds':
      checkThresholds();
      break;
    case '--audit':
      const aRes = audit(true, isJson);
      if (isStrict) {
        const hasViolations = aRes.recommendations && aRes.recommendations.some((r) => r.type === 'fix-code');
        const isUnhealthy = aRes.healthy === false;
        if (hasViolations || isUnhealthy) process.exit(1);
      }
      break;
    case '--verify-rules':
      const vRes = verifyRules(!isJson);
      if (isJson) console.log(JSON.stringify(vRes, null, 2));
      if (!vRes.passed) process.exit(1);
      break;
    case '--incident':
      printLastIncident(isJson);
      break;
    case '--history':
      if (isJson) {
        const evolution = loadEvolution();
        console.log(JSON.stringify(evolution.history || [], null, 2));
      } else {
        printHistory();
      }
      break;
    case '--clean-telemetry':
      const cRes = cleanTelemetry(!isJson);
      if (isJson) console.log(JSON.stringify(cRes, null, 2));
      break;
    case '--prune-telemetry':
      const pRes = pruneTelemetry(cleanArgs[1] || 90, !isJson);
      if (isJson) console.log(JSON.stringify(pRes, null, 2));
      break;
    case '--pre-commit':
      runPreCommit(isJson);
      break;
    case '--report':
      generateReport(cleanArgs[1]);
      break;
    case '--log-history':
      logHistory(cleanArgs[1], cleanArgs[2], cleanArgs[3]);
      break;
    case '--scaffold':
      scaffold(cleanArgs[1]);
      break;
    default:
      console.error(`Неизвестная команда: ${command}`);
      process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  // Telemetry
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
  // Harvester
  privateDomainPatterns,
  slugify,
  auditSkillsQuality,
  harvestTroubleshooting,
  auditTechDebt,
  checkUpstreamSync,
  // Rules
  scanHooksOrder,
  scanRawDtoInUi,
  verifyRules,
  runPreCommit,
  // Coordinator
  audit,
  generateReport,
  scaffold,
};
