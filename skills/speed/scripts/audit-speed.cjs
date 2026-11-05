#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');

const workspaceRoot = path.resolve(__dirname, '../../../..');
const isJson = process.argv.includes('--json');
const isCleanMode = process.argv.includes('--clean');

let isAdmin = false;
if (os.platform() === 'win32') {
  try {
    const adminCheck = execSync('powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    isAdmin = adminCheck.toLowerCase() === 'true';
  } catch (_) {}
}

const report = {
  timestamp: new Date().toISOString(),
  platform: os.platform(),
  isAdmin,
  checks: [],
  recommendations: [],
  benchmark: null,
};

function addCheck(status, category, summary, details = null) {
  report.checks.push({ status, category, summary, details });
}

function addRecommendation(action, target, commandOrDiff = null, isSafe = true) {
  report.recommendations.push({ action, target, commandOrDiff, isSafe });
}

// 1. Audit .gitignore
function checkGitIgnore() {
  const gitIgnorePath = path.join(workspaceRoot, '.gitignore');
  if (!fs.existsSync(gitIgnorePath)) {
    addCheck('[✗]', 'VCS', 'Файл .gitignore отсутствует в корне проекта');
    addRecommendation('CREATE', '.gitignore', 'node_modules/\ndist/\n.tmp/\n.storage/\n*.sqlite\n*.7z\n*.zip\n', true);
    return;
  }

  const content = fs.readFileSync(gitIgnorePath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const missingPatterns = [];

  const recommendedPatterns = ['.storage', '*.sqlite', '*.7z', '*.zip', '.tmp', 'dist', 'node_modules'];
  for (const pat of recommendedPatterns) {
    const hasPattern = lines.some(l => l === pat || l === pat + '/' || l === '/' + pat || l === pat.replace('*', ''));
    if (!hasPattern) {
      missingPatterns.push(pat);
    }
  }

  if (missingPatterns.length > 0) {
    addCheck('[!]', 'VCS', `В .gitignore отсутствуют рекомендуемые паттерны исключений: ${missingPatterns.join(', ')}`);
    addRecommendation('UPDATE', '.gitignore', missingPatterns.join('\n'), true);
  } else {
    addCheck('[✓]', 'VCS', 'Файл .gitignore содержит основные исключения для бинарников и временных директорий');
  }
}

// 2. Audit .vscode/settings.json
function checkVsCodeSettings() {
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const settingsPath = path.join(vscodeDir, 'settings.json');
  let settings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      try {
        settings = JSON.parse(raw);
      } catch (_) {
        const clean = raw.replace(/^\s*\/\/.*$/gm, '');
        settings = JSON.parse(clean || '{}');
      }
    } catch (_) {
      settings = {};
    }
  }

  const watcher = settings['files.watcherExclude'] || {};
  const search = settings['search.exclude'] || {};

  const neededWatcherPatterns = ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/.tmp/**', '**/.storage/**'];
  const missingWatcher = neededWatcherPatterns.filter(p => !watcher[p]);

  if (missingWatcher.length > 0) {
    addCheck('[!]', 'IDE Watcher', `В .vscode/settings.json не настроены исключения watcher: ${missingWatcher.join(', ')}`);
    addRecommendation('UPDATE', '.vscode/settings.json (Watcher & Search)', {
      'files.watcherExclude': {
        ...watcher,
        '**/.git/**': true,
        '**/node_modules/**': true,
        '**/dist/**': true,
        '**/.tmp/**': true,
        '**/.storage/**': true,
      },
      'search.exclude': {
        ...search,
        '**/node_modules': true,
        '**/dist': true,
        '**/.tmp': true,
        '**/.storage': true,
      },
    }, true);
  } else {
    addCheck('[✓]', 'IDE Watcher', 'Фоновые исключения watcher и search в .vscode/settings.json настроены оптимально');
  }
}

// 3. Audit Heavy & Temporary Files (Safety First: Masking before Deletion)
function checkHeavyFiles() {
  const heavyArchives = [];
  const trackedDirs = [];

  // Check .tmp directory
  const tmpDir = path.join(workspaceRoot, '.tmp');
  if (fs.existsSync(tmpDir)) {
    trackedDirs.push('.tmp');
  }

  // Check .storage directory
  const storageDir = path.join(workspaceRoot, '.storage');
  if (fs.existsSync(storageDir)) {
    trackedDirs.push('.storage');
  }

  // Check root files for heavy standalone archives
  try {
    const rootEntries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile()) {
        const full = path.join(workspaceRoot, entry.name);
        const ext = path.extname(entry.name).toLowerCase();
        if (['.7z', '.zip', '.tar', '.gz'].includes(ext)) {
          const s = fs.statSync(full);
          const sizeMb = (s.size / (1024 * 1024)).toFixed(2);
          heavyArchives.push({ path: entry.name, sizeMb: `${sizeMb} MB` });
        }
      }
    }
  } catch (_) {}

  // Check if directories are masked in .vscode/settings.json
  const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
  let isMasked = false;
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const w = s['files.watcherExclude'] || {};
      isMasked = Boolean(w['**/.tmp/**'] && w['**/.storage/**']);
    } catch (_) {}
  }

  if (trackedDirs.length > 0) {
    if (isMasked) {
      addCheck('[✓]', 'Disk / Cache', `Временные каталоги (${trackedDirs.join(', ')}) изолированы от IDE Watcher (файлы сохранены)`);
    } else {
      addCheck('[!]', 'Disk / Cache', `Временные каталоги (${trackedDirs.join(', ')}) нагружают IDE Watcher. Рекомендуется маскирование`);
    }
  }

  if (heavyArchives.length > 0) {
    addCheck('[!]', 'Disk / Cache', `Обнаружены архивные файлы в корне: ${heavyArchives.map(a => `${a.path} (${a.sizeMb})`).join(', ')}`);
    if (isCleanMode) {
      addRecommendation('CLEANUP', 'Архивные файлы (физическое удаление)', heavyArchives, false);
    } else {
      addRecommendation('CLEANUP_PROPOSAL', 'Архивные файлы (удаление по запросу)', heavyArchives, false);
    }
  } else if (trackedDirs.length === 0) {
    addCheck('[✓]', 'Disk / Cache', 'Критических тяжелых или мусорных временных файлов в корне не обнаружено');
  }
}

// 4. Audit Windows Defender / Antivirus
function checkAntivirus() {
  if (os.platform() === 'win32') {
    try {
      // Check if project is already excluded
      const exclusions = execSync('powershell -NoProfile -Command "(Get-MpPreference -ErrorAction SilentlyContinue).ExclusionPath"', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      }).toLowerCase();

      const normalizedRoot = workspaceRoot.toLowerCase();
      if (exclusions.includes(normalizedRoot)) {
        addCheck('[✓]', 'Antivirus', 'Каталог проекта уже добавлен в исключения Windows Defender');
        return;
      }

      const psOutput = execSync('powershell -NoProfile -Command "Get-Process -Name MsMpEng -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CPU"', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 4000,
      }).trim();

      if (psOutput) {
        const cpuSec = parseFloat(psOutput.replace(',', '.'));
        if (cpuSec > 100) {
          const modeLabel = isAdmin ? '(доступно авто-выполнение)' : '(требуются права Администратора)';
          addCheck('[!]', 'Antivirus', `Windows Defender не исключает проект (${Math.round(cpuSec)} сек CPU). ${modeLabel}`);
          addRecommendation(
            isAdmin ? 'EXCLUDE_AUTO' : 'EXCLUDE_MANUAL',
            `Windows Defender ${modeLabel}`,
            `Add-MpPreference -ExclusionPath "${workspaceRoot}"`,
            isAdmin
          );
          return;
        }
      }
    } catch (_) {}
  }
  addCheck('[✓]', 'Antivirus', 'Аномальной нагрузки защитника ОС на диск в текущий момент не зафиксировано');
}

// 5. Audit Git Status
function checkGitStatus() {
  try {
    const raw = execSync('git status --porcelain', {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length > 30) {
      addCheck('[!]', 'Git Tree', `Рабочее дерево Git содержит ${lines.length} незакоммиченных изменений. Оверхед на вычисление статуса`);
      addRecommendation('COMMIT_OR_CLEAN', 'Git Tree', `Зафиксировать или откатить ${lines.length} файлов`, false);
    } else {
      addCheck('[✓]', 'Git Tree', `Рабочее дерево Git в порядке (изменений: ${lines.length})`);
    }
  } catch (_) {
    addCheck('[!]', 'Git Tree', 'Не удалось прочитать git status');
  }
}

// 6. Benchmark Typecheck (npx tsc --noEmit)
function benchmarkTypecheck() {
  const tsConfig = path.join(workspaceRoot, 'tsconfig.json');
  if (fs.existsSync(tsConfig)) {
    const t0 = performance.now();
    try {
      execSync('npx tsc --noEmit', {
        cwd: workspaceRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 25000,
      });
      const durationMs = Math.round(performance.now() - t0);
      report.benchmark = { command: 'npx tsc --noEmit', durationMs };
      if (durationMs > 6000) {
        addCheck('[!]', 'Benchmark', `Проверка типов npx tsc --noEmit занимает ${durationMs} мс (> 6 сек)`);
      } else {
        addCheck('[✓]', 'Benchmark', `Проверка типов npx tsc --noEmit выполнена за ${durationMs} мс`);
      }
    } catch (_) {
      const durationMs = Math.round(performance.now() - t0);
      report.benchmark = { command: 'npx tsc --noEmit', durationMs, error: true };
      addCheck('[!]', 'Benchmark', `Проверка типов npx tsc --noEmit завершилась с ошибками (${durationMs} мс)`);
    }
  }
}

// Run All Checks
checkGitIgnore();
checkVsCodeSettings();
checkHeavyFiles();
checkAntivirus();
checkGitStatus();

if (process.argv.includes('--bench')) {
  benchmarkTypecheck();
}

if (isJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n=== [SPEED AUDIT REPORT] ===\n');
  for (const c of report.checks) {
    console.log(`${c.status} [${c.category}] ${c.summary}`);
  }
  if (report.benchmark) {
    console.log(`\n[BENCHMARK] ${report.benchmark.command}: ${report.benchmark.durationMs} ms`);
  }
  if (report.recommendations.length > 0) {
    console.log('\n--- Пакет рекомендаций по оптимизации: ---');
    report.recommendations.forEach((r, idx) => {
      const safetyTag = r.isSafe ? '[Безопасно: правка конфигурации]' : '[Внимание: мутация/удаление данных]';
      console.log(`\n${idx + 1}. [${r.action}] ${r.target} ${safetyTag}`);
      if (typeof r.commandOrDiff === 'string') {
        console.log(`   ${r.commandOrDiff.replace(/\n/g, '\n   ')}`);
      } else if (Array.isArray(r.commandOrDiff)) {
        r.commandOrDiff.forEach(item => {
          console.log(`   - ${item.path} (${item.sizeMb || 'dir'})`);
        });
      }
    });
  }
  console.log('\n============================\n');
}
