#!/usr/bin/env node

/**
 * Automated Test Suite for /observer Skill
 * Verifies core functionality, regex precision, data hygiene, and CLI contracts.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const observerScript = path.join(__dirname, 'observer.cjs');
const observer = require(observerScript);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  } else {
    passedTests++;
    console.log(`[PASS] ${message}`);
  }
}

console.log('=== Running /observer Automated Test Suite ===\n');

// 1. Test CLI threshold check with JSON
try {
  const output = execSync(`node "${observerScript}" --check-thresholds`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(typeof parsed.triggered === 'boolean', 'CLI --check-thresholds returns valid JSON object');
  assert(typeof parsed.requestCount === 'number', 'CLI --check-thresholds includes requestCount');
} catch (err) {
  assert(false, `CLI --check-thresholds failed: ${err.message}`);
}

// 2. Test CLI verify-rules with JSON
try {
  const output = execSync(`node "${observerScript}" --verify-rules --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(typeof parsed.passed === 'boolean', 'CLI --verify-rules --json returns { passed } boolean');
  assert(Array.isArray(parsed.violations), 'CLI --verify-rules --json returns violations array');
} catch (err) {
  assert(false, `CLI --verify-rules failed: ${err.message}`);
}

// 3. Test CLI clean-telemetry with JSON
try {
  const output = execSync(`node "${observerScript}" --clean-telemetry --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(typeof parsed.modified === 'boolean', 'CLI --clean-telemetry --json returns { modified }');
  assert(Array.isArray(parsed.migrated), 'CLI --clean-telemetry --json returns { migrated } array');
} catch (err) {
  assert(false, `CLI --clean-telemetry failed: ${err.message}`);
}

// 4. Test CLI incident inspection with JSON
try {
  const output = execSync(`node "${observerScript}" --incident --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(typeof parsed.hasIncident === 'boolean', 'CLI --incident --json returns { hasIncident }');
} catch (err) {
  assert(false, `CLI --incident failed: ${err.message}`);
}

// 5. Test CLI history inspection with JSON
try {
  const output = execSync(`node "${observerScript}" --history --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(Array.isArray(parsed), 'CLI --history --json returns history array');
} catch (err) {
  assert(false, `CLI --history failed: ${err.message}`);
}

// 6. Test CLI prune-telemetry with JSON
try {
  const output = execSync(`node "${observerScript}" --prune-telemetry 90 --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(typeof parsed.prunedCount === 'number', 'CLI --prune-telemetry --json returns { prunedCount }');
} catch (err) {
  assert(false, `CLI --prune-telemetry failed: ${err.message}`);
}

// 7. Test CLI pre-commit with JSON
try {
  const output = execSync(`node "${observerScript}" --pre-commit --json`, { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  assert(typeof parsed.passed === 'boolean', 'CLI --pre-commit --json returns { passed }');
  assert(typeof parsed.hygieneHealthy === 'boolean', 'CLI --pre-commit --json returns { hygieneHealthy }');
} catch (err) {
  assert(false, `CLI --pre-commit failed: ${err.message}`);
}

// 8. Test programmatic AST scanHooksOrder and scanRawDtoInUi
const snippetEarlyReturn = `
function BadComponent({ user }) {
  if (!user) {
    return null;
  }
  const [data, setData] = useState(null);
  return <div>{data}</div>;
}
`;

const snippetEventHandler = `
function GoodComponent({ user }) {
  const handleClick = () => {
    if (!user) return;
    doAction();
  };
  const [data, setData] = useState(null);
  return <button onClick={handleClick}>{data}</button>;
}
`;

const snippetCustomHook = `
function useCustomQuery(id) {
  if (!id) return null;
  const state = useStore();
  return state;
}
`;

const snippetDto = `
import { UserDto } from '@/models/dto';
import { StoryDTO } from '@/models/story';
export function MyView() { return <div />; }
`;

try {
  const v1 = observer.scanHooksOrder('src/components/Bad.tsx', snippetEarlyReturn);
  assert(v1.length === 1, 'scanHooksOrder catches multiline early return before hook');

  const v2 = observer.scanHooksOrder('src/components/Good.tsx', snippetEventHandler);
  assert(v2.length === 0, 'scanHooksOrder does not produce false positives on inner callbacks');

  const v3 = observer.scanHooksOrder('src/components/useCustom.tsx', snippetCustomHook);
  assert(v3.length === 1, 'scanHooksOrder detects violations in custom hooks (useCustomQuery)');

  const dtoViolations = observer.scanRawDtoInUi('src/components/View.tsx', snippetDto);
  assert(dtoViolations.length === 2, 'scanRawDtoInUi detects both *Dto and *DTO');
} catch (err) {
  assert(false, `AST scanHooksOrder programmatic test failed: ${err.message}`);
}

console.log(`\n=== Test Results: ${passedTests}/${totalTests} Passed ===`);
if (passedTests !== totalTests) {
  process.exit(1);
} else {
  console.log('[ALL TESTS PASSED]');
}
