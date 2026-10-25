#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const {
  workspaceRoot,
  agentsDir,
  skillsDir,
  loadObserverConfig,
} = require('./telemetry.cjs');

const privateDomainPatterns = [
  /\bsrc\/components\/tree\b/i,
  /\bsrc\/components\/graph\b/i,
  /\btreeGraphLayout\b/i,
  /\bSceneContentEditor\b/i,
];

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9а-яё]+/g, '-').replace(/^-+|-+$/g, '');
}

// 1. Skill Linter & Generalization Audit (Zero Specificity Bias & Quality Guard)
function auditSkillsQuality(verbose = true) {
  const config = loadObserverConfig();
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

          // B. Size / Token Budget check
          if (lines.length > config.maxSkillLines) {
            skillLintIssues.push(`[${entry.name}] Exceeds token budget (${lines.length} lines > ${config.maxSkillLines} max). Consider compressing.`);
          }

          // C. Frontmatter validation
          const fmMatch = skillContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (!fmMatch) {
            skillLintIssues.push(`[${entry.name}] Missing YAML frontmatter.`);
          } else {
            const fm = fmMatch[1];
            if (!fm.match(/^name:\s*[a-zA-Z0-9_-]+/m)) {
              skillLintIssues.push(`[${entry.name}] Frontmatter missing valid "name" property.`);
            }
            if (!fm.match(/^description:\s*[\s\S]+/m)) {
              skillLintIssues.push(`[${entry.name}] Frontmatter missing "description" property.`);
            }
          }

          // D. Mandatory structural sections (flexible across declarative, procedural and orchestrators)
          const hasPrinciplesOrAlgorithm = /##\s*.*(Принцип|Алгоритм|Порядок|Структура|Workflow|Principles|Execution)/i.test(skillContent);
          if (!hasPrinciplesOrAlgorithm) {
            skillLintIssues.push(`[${entry.name}] Missing core execution or principles heading.`);
          }

          // E. Orphan script detection in skills/*/scripts/
          const scriptsSubdir = path.join(skillsDir, entry.name, 'scripts');
          if (fs.existsSync(scriptsSubdir)) {
            const scriptEntries = fs.readdirSync(scriptsSubdir, { withFileTypes: true });
            for (const se of scriptEntries) {
              if (se.isFile() && se.name.endsWith('.cjs')) {
                if (!skillContent.includes(se.name)) {
                  skillLintIssues.push(`[${entry.name}] Contains orphan script "${se.name}" not referenced in SKILL.md.`);
                }
              }
            }
          }

          // Strip inline backticks and code fences to avoid false positives
          const contentWithoutCode = skillContent
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`\r\n]+`/g, '');

          // F. Absolute path detection
          if (contentWithoutCode.includes('file:///') || contentWithoutCode.match(/[a-zA-Z]:\\[a-zA-Z0-9_.-]+/)) {
            skillLintIssues.push(`[${entry.name}] Contains absolute file paths outside code blocks. Use relative paths only.`);
          }

          // G. Legacy XML tags detection
          const xmlMatch = contentWithoutCode.match(/<\/?(handoff_context|architecture_map|feature_status)[^>]*>/i);
          if (xmlMatch) {
            skillLintIssues.push(`[${entry.name}] Contains legacy XML tags (${xmlMatch[0]}). Format as clean Markdown.`);
          }

          // H. Zero Specificity Bias
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

  if (verbose) {
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

  return { missingFeedbackSkills, skillLintIssues };
}

// 2. Troubleshooting Harvester (Semantic Anti-Pattern Aggregation & Rule Synthesis)
function harvestTroubleshooting(verbose = true) {
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

  if (troubleshootingFiles.length === 0) return [];

  const clusters = {
    'react-hooks-order': {
      title: 'React Hooks Order Guarantee',
      proposedRule: '* **Rules of Hooks**: Strict prohibition of early returns (`if (!data) return ...`) before hook calls (`useMemo`, `useCallback`, `useEffect`). All hooks must execute unconditionally in uniform order.',
      incidents: 0,
      patterns: [/hooks/i, /Rendered fewer hooks/i],
    },
    'async-canvas-dimensions': {
      title: 'Async DOM & Virtual Canvas Synchronization',
      proposedRule: '* **Canvas Layout Sizing**: Asynchronous DOM node size mutations must use debounced recalculations (>=60ms) and suspend layout reflow during active drag (`dragging: true`) to prevent coordinate drift.',
      incidents: 0,
      patterns: [/canvas/i, /dimensions/i, /nodeHeights/i, /resize/i, /dragDebounce/i, /beat.*centering/i],
    },
    'tooltip-drag-collision': {
      title: 'Tooltip & Popover Dismissal on Drag/Scroll',
      proposedRule: '* **Popover/Tooltip Dismissal**: Hover tooltips and popovers must bind global capture listeners for `dragstart`, `scroll`, and `wheel` to immediately dismiss floating layers and prevent viewport sticking.',
      incidents: 0,
      patterns: [/tooltip/i, /тултип/i, /залипание/i, /hover bridge/i],
    },
    'spatial-ordering-collision': {
      title: 'Spatial Collision & Drag Sorting Policies',
      proposedRule: '* **Spatial Ordering Policies**: Entity trees and canvas nodes must declare explicit drag tiers (`fixed`, `draggable`, `no_drag`) with unified `orderIndex` and atomic collision resolution before persisting changes.',
      incidents: 0,
      patterns: [/orderIndex/i, /nodeSorting/i, /resolveCollisions/i, /drag-and-drop/i, /перетаскиван/i],
    },
    'ai-model-resilience': {
      title: 'AI Model Catalog & Availability Fallbacks',
      proposedRule: '* **Dynamic Model Resilience**: Model availability is volatile; external AI model catalogs must be dynamically synchronized and cached in SQLite with safe fallbacks and graceful 404/400 handling.',
      incidents: 0,
      patterns: [/OpenRouter 404/i, /gemini.*unavailable/i, /Google AI Studio 404/i, /models\/.*unavailable/i, /batch.*cannot be used/i, /model catalog/i],
    },
    'icon-contract-uniformity': {
      title: 'Component Presentation & Icon Unification',
      proposedRule: '* **Presentation Icon Contracts**: Visual representations of domain entities (icons, badges, titles) must use unified pure mappers across all UI contexts to prevent visual drift.',
      incidents: 0,
      patterns: [/icons-event/i, /getNodeIcon/i, /getFieldIcon/i, /SectionCardItem.*икон/i],
    },
  };

  let totalIncidents = 0;
  const dynamicTagCounts = {};

  troubleshootingFiles.forEach((f) => {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n').filter((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l));
      totalIncidents += lines.length;

      for (const line of lines) {
        let matchedCanonical = false;
        for (const cluster of Object.values(clusters)) {
          if (cluster.patterns.some((p) => p.test(line))) {
            cluster.incidents += 1;
            matchedCanonical = true;
          }
        }

        // Dynamic tag extraction from brackets: [scope/subscope] or [scope]
        const bracketMatches = line.match(/\[([^\]]+)\]/g);
        if (bracketMatches) {
          for (const rawTag of bracketMatches) {
            const cleanTag = rawTag.replace(/[\[\]]/g, '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(cleanTag)) continue;
            // Normalize tag base (e.g. "tree/cards-selection" -> "tree/cards")
            const parts = cleanTag.split('/');
            const baseTag = parts.length > 1
              ? `${parts[0]}/${parts[1].split('-')[0]}`
              : cleanTag.split(/[\s\-]/)[0];

            // Only consider structured identifier tags (e.g. "tree/cards", "ai/models", "layout/resizer")
            const isIdentifier = /^[a-zA-Z0-9_\-]+(\/[a-zA-Z0-9_\-]+)+$/.test(cleanTag) ||
              (/^[a-zA-Z0-9_-]{3,24}$/.test(baseTag) && !/^(при|для|или|как|где|что|после|когда)$/i.test(baseTag));

            if (baseTag && isIdentifier && !matchedCanonical) {
              dynamicTagCounts[baseTag] = (dynamicTagCounts[baseTag] || 0) + 1;
            }
          }
        }
      }
    } catch (_) {}
  });

  const candidateRules = Object.values(clusters).filter((c) => c.incidents >= 2);

  // Synthesize candidate rules from dynamic tags with >= 2 incidents
  for (const [tag, count] of Object.entries(dynamicTagCounts)) {
    if (count >= 2 && !candidateRules.some((c) => c.title.toLowerCase().includes(tag.toLowerCase()))) {
      candidateRules.push({
        title: `Dynamic Tag Cluster: ${tag}`,
        proposedRule: `* **Standardization for ${tag}**: Detected ${count} recurring incidents. Standardize interfaces, contracts, and error handling in ${tag} modules to eliminate recurring regressions.`,
        incidents: count,
        patterns: [new RegExp(tag, 'i')],
      });
    }
  }

  if (verbose) {
    console.log(`[TROUBLESHOOTING HARVEST] Analyzed ${totalIncidents} incidents across ${troubleshootingFiles.length} modules.`);
    if (candidateRules.length > 0) {
      console.log('\n[HARVESTED RULE CANDIDATES] Recurring incident clusters synthesized for docs/project-rules.md:');
      candidateRules.forEach((c) => {
        console.log(`  - [${c.title}] (${c.incidents} recurring incidents)`);
        console.log(`    Actionable Rule: ${c.proposedRule}\n`);
      });
    }
  }

  return candidateRules;
}

// 3. Technical Debt Ledger Age Monitor
function auditTechDebt(verbose = true) {
  const config = loadObserverConfig();
  const techdebtFile = path.join(workspaceRoot, 'docs', 'techdebt.md');
  if (!fs.existsSync(techdebtFile)) return { recommendations: [], hygieneIssues: [] };

  const recommendations = [];
  const hygieneIssues = [];
  try {
    const content = fs.readFileSync(techdebtFile, 'utf8');
    const lines = content.split('\n');
    const now = Date.now();
    const agingDebts = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine.startsWith('- ') && !rawLine.startsWith('* ')) continue;

      const match = rawLine.match(/^[-*]\s*\[(\d{4}-\d{2}-\d{2})\]\s*\[([^\]]+)\]\s*→\s*([^→]+)\s*→\s*(.+)$/);
      if (!match) {
        hygieneIssues.push({
          line: i + 1,
          content: rawLine,
          message: 'Malformed syntax. Required: - [YYYY-MM-DD] [scope] → [issue] → [remediation]',
        });
        continue;
      }

      const [, dateStr, scope, issue, remediation] = match;
      const parsedDate = new Date(dateStr).getTime();
      if (isNaN(parsedDate)) {
        hygieneIssues.push({
          line: i + 1,
          content: rawLine,
          message: `Invalid ISO date: "${dateStr}"`,
        });
        continue;
      }

      const debtAgeDays = Math.floor((now - parsedDate) / (1000 * 60 * 60 * 24));
      if (debtAgeDays >= config.debtAgeThresholdDays) {
        agingDebts.push({
          date: dateStr,
          scope: scope.trim(),
          issue: issue.trim(),
          remediation: remediation.trim(),
          ageDays: debtAgeDays,
        });
      }
    }

    if (hygieneIssues.length > 0 && verbose) {
      console.warn(`[TECH DEBT HYGIENE WARNING] Found ${hygieneIssues.length} malformed entry(ies) in docs/techdebt.md:`);
      hygieneIssues.forEach((h) => console.warn(`  - Line ${h.line}: ${h.message}`));
    }

    if (agingDebts.length > 0) {
      if (verbose) {
        console.warn(`[TECH DEBT AGING ALERT] Found ${agingDebts.length} technical debt item(s) older than ${config.debtAgeThresholdDays} days:`);
        agingDebts.forEach((d) => {
          console.warn(`  - [${d.date}] (${d.ageDays}d old) [${d.scope}] → ${d.issue} → Plan: ${d.remediation}`);
        });
        console.warn('Consider scheduling remediation via /resolve.\n');
      }
      agingDebts.forEach((d) => {
        recommendations.push({
          type: 'resolve',
          target: d.scope,
          reason: `Техдолг старше ${d.ageDays}д: [${d.scope}] ${d.issue}`,
          action: `Запустить /resolve для устранения: ${d.remediation}`,
          necessityMet: true,
          sufficiencyMet: true,
          debtMeta: d,
        });
      });
    }
  } catch (_) {}
  return { recommendations, hygieneIssues };
}

// 4. Upstream Sync Health Hint
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
        console.log('  node .agents/skills/agents/scripts/sync.cjs push "description"\n');
      }
    } catch (_) {}
  }
}

module.exports = {
  privateDomainPatterns,
  slugify,
  auditSkillsQuality,
  harvestTroubleshooting,
  auditTechDebt,
  checkUpstreamSync,
};
