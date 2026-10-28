#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { workspaceRoot, auditTelemetryHygiene } = require('./telemetry.cjs');
const { auditTechDebt } = require('./harvester.cjs');

// 1. Synthesized Architecture Rule Verification
function scanHooksOrder(filePath, content) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  let insideComponent = false;
  let componentName = '';
  let blockStack = [];
  let hasEarlyReturn = false;
  let earlyReturnLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const lineNum = i + 1;

    // Detect React component or Custom Hook definition
    if (!insideComponent) {
      const compMatch = line.match(/(?:function\s+([A-Z][a-zA-Z0-9]+|use[A-Z][a-zA-Z0-9]+)|const\s+([A-Z][a-zA-Z0-9]+|use[A-Z][a-zA-Z0-9]+)\s*=\s*(?:React\.)?(?:memo\()?\(?)/);
      if (compMatch) {
        insideComponent = true;
        componentName = compMatch[1] || compMatch[2];
        blockStack = [{ kind: 'comp' }];
        hasEarlyReturn = false;
        earlyReturnLine = 0;
        continue;
      }
    }

    if (insideComponent) {
      const openMatches = line.match(/\{/g) || [];
      const closeMatches = line.match(/\}/g) || [];

      const isInnerFn = /(?:=>|\bfunction\b)\s*\{?/.test(line);
      const isIfBlock = /\b(?:if\s*\(|else\b)\s*\{?/.test(line);

      const hasNestedFnInStack = blockStack.some((b) => b.kind === 'fn');
      if (!hasNestedFnInStack && blockStack.length <= 2 && /\bif\s*\(.*?\)\s*return\b/.test(line)) {
        hasEarlyReturn = true;
        earlyReturnLine = lineNum;
      }

      for (const _ of openMatches) {
        let kind = 'other';
        if (isInnerFn) {
          kind = 'fn';
        } else if (isIfBlock) {
          kind = 'if';
        }
        blockStack.push({ kind });
      }

      if (!hasEarlyReturn && !hasNestedFnInStack && blockStack.length >= 2 && blockStack[blockStack.length - 1].kind === 'if') {
        if (/\breturn\b/.test(line)) {
          hasEarlyReturn = true;
          earlyReturnLine = lineNum;
        }
      }

      if (hasEarlyReturn && blockStack.length <= 2 && !hasNestedFnInStack) {
        const hookCallMatch = line.match(/(?<!function\s+|const\s+)\b(use[A-Z][a-zA-Z0-9]*)\s*\(/);
        if (hookCallMatch) {
          violations.push({
            rule: 'Rules of Hooks Guarantee',
            file: path.relative(workspaceRoot, filePath),
            line: lineNum,
            message: `Hook "${hookCallMatch[1]}" called at line ${lineNum} after early return at line ${earlyReturnLine} in component/hook "${componentName}". Move hooks above early returns.`,
          });
        }
      }

      for (const _ of closeMatches) {
        if (blockStack.length > 0) {
          blockStack.pop();
        }
      }

      if (blockStack.length === 0) {
        insideComponent = false;
        hasEarlyReturn = false;
      }
    }
  }
  return violations;
}

function scanRawDtoInUi(filePath, content) {
  const violations = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (!normalizedPath.includes('src/components')) return violations;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*import\b/.test(line)) {
      const dtoMatch = line.match(/\b([A-Z][a-zA-Z0-9]*(?:Dto|DTO))\b/);
      if (dtoMatch) {
        violations.push({
          rule: 'Anti-Corruption Layer (ACL)',
          file: path.relative(workspaceRoot, filePath),
          line: i + 1,
          message: `UI component imports raw DTO "${dtoMatch[1]}". Map DTOs to domain entities before UI consumption.`,
        });
      }

      const backendMatch = line.match(/from\s+['"]([^'"]*(?:backend|sqlite|database)[^'"]*)['"]/i);
      if (backendMatch) {
        violations.push({
          rule: 'Anti-Corruption Layer (ACL)',
          file: path.relative(workspaceRoot, filePath),
          line: i + 1,
          message: `UI component directly imports raw data layer "${backendMatch[1]}". Use domain store or ACL service.`,
        });
      }
    }
  }
  return violations;
}

function verifyRules(verbose = true) {
  const violations = [];
  const srcDirectory = path.join(workspaceRoot, 'src');

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', '.archives', '.tmp'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        if (entry.name.endsWith('.d.ts')) continue;
        try {
          const stat = fs.statSync(full);
          if (stat.size > 512 * 1024) continue;
          const content = fs.readFileSync(full, 'utf8');
          violations.push(...scanHooksOrder(full, content));
          violations.push(...scanRawDtoInUi(full, content));
        } catch (_) {}
      }
    }
  }

  scanDir(srcDirectory);

  if (verbose) {
    console.log('[RULE VERIFICATION] Checking codebase against synthesized architecture rules:');
    if (violations.length === 0) {
      console.log('  [PASS] 0 rule violations detected across src/. Rules of Hooks and ACL contracts intact.\n');
    } else {
      console.warn(`  [VIOLATION] Found ${violations.length} rule violation(s) in codebase:`);
      violations.forEach((v) => {
        console.warn(`    - [${v.rule}] ${v.file}:${v.line} → ${v.message}`);
      });
      console.warn('');
    }
  }

  return { passed: violations.length === 0, violations };
}

function runPreCommit(jsonMode = false) {
  const hygiene = auditTelemetryHygiene(true, !jsonMode);
  const vRes = verifyRules(!jsonMode);
  const debt = auditTechDebt(!jsonMode);
  const hasErrors = !vRes.passed || !hygiene.healthy;

  const result = {
    passed: !hasErrors,
    hygieneHealthy: hygiene.healthy,
    rulesPassed: vRes.passed,
    ruleViolationsCount: vRes.violations.length,
    debtHygieneCount: debt.hygieneIssues.length,
  };

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!hasErrors) {
    console.log('[PRE-COMMIT PASS] Codebase rules, telemetry schema, and contracts intact.\n');
  } else {
    console.error('\n[PRE-COMMIT FAIL] Pre-commit gate checks failed. Address violations above.\n');
  }

  if (hasErrors) process.exit(1);
  return result;
}

module.exports = {
  scanHooksOrder,
  scanRawDtoInUi,
  verifyRules,
  runPreCommit,
};
