const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../../..');
const srcDir = path.join(workspaceRoot, 'src');

if (!fs.existsSync(srcDir)) {
  console.log('[ARCH CHECK] No src/ directory found, skipping.');
  process.exit(0);
}

// 1. Resolve path aliases dynamically from tsconfig / src directories
const aliases = {
  '@': srcDir,
};

function loadTsConfigAliases() {
  const tsConfigPaths = [
    path.join(workspaceRoot, 'tsconfig.json'),
    path.join(workspaceRoot, 'tsconfig.app.json'),
  ];

  for (const configPath of tsConfigPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        // Basic comment stripping for json
        const clean = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const parsed = JSON.parse(clean);
        const paths = parsed.compilerOptions?.paths;
        if (paths) {
          for (const [aliasPattern, targetPatterns] of Object.entries(paths)) {
            const aliasKey = aliasPattern.replace(/\/\*$/, '');
            const target = targetPatterns[0]?.replace(/\/\*$/, '');
            if (aliasKey && target) {
              aliases[aliasKey] = path.resolve(workspaceRoot, target);
            }
          }
        }
      } catch (_) {}
    }
  }

  // Auto-register top-level src subdirectories as @layer aliases if not set
  if (fs.existsSync(srcDir)) {
    const items = fs.readdirSync(srcDir);
    for (const item of items) {
      const full = path.join(srcDir, item);
      if (fs.statSync(full).isDirectory() && !item.startsWith('.')) {
        if (!aliases[`@${item}`]) {
          aliases[`@${item}`] = full;
        }
      }
    }
  }
}

loadTsConfigAliases();

const extensions = [
  '.ts', '.tsx', '.js', '.jsx', '.css', '.svg', '.json',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx'
];

function resolveImportToFile(resolvedPath) {
  if (fs.existsSync(resolvedPath)) {
    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) return path.resolve(resolvedPath);
    } catch (_) {}
  }
  for (const ext of extensions) {
    const p = ext.startsWith('/') ? path.join(resolvedPath, ext) : resolvedPath + ext;
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        if (stat.isFile()) return path.resolve(p);
      } catch (_) {}
    }
  }
  return null;
}

// 2. Discover all independent modules (directories containing index.ts/tsx)
const modules = [];

function findModules(dir, depth = 0) {
  if (!fs.existsSync(dir) || depth > 4) return;
  const list = fs.readdirSync(dir);
  let hasIndex = false;

  for (const file of list) {
    if (file === 'index.ts' || file === 'index.tsx') {
      hasIndex = true;
      break;
    }
  }

  // Treat directory as module if it has index and is not src root itself
  if (hasIndex && dir !== srcDir) {
    modules.push(dir);
  }

  for (const file of list) {
    const fullPath = path.join(dir, file);
    if (
      file !== 'node_modules' &&
      file !== '.git' &&
      file !== '.archives' &&
      file !== 'dist' &&
      fs.statSync(fullPath).isDirectory()
    ) {
      findModules(fullPath, depth + 1);
    }
  }
}

findModules(srcDir);

// 3. Parse DAG hierarchy dynamically from docs/architecture.md
const DEFAULT_DAG = [
  'shared',
  'core',
  'schema',
  'model',
  'kernel',
  'plugins',
  'store',
  'canvas',
  'components',
  'demo',
];

function getLayerHierarchy() {
  const archFile = path.join(workspaceRoot, 'docs/architecture.md');
  if (!fs.existsSync(archFile)) return DEFAULT_DAG;

  try {
    const content = fs.readFileSync(archFile, 'utf8');

    // 1. Check explicit DAG chain: `demo` → `components` → ... → `shared`
    const dagMatch = content.match(/Однонаправленный поток[^:]*:\s*\n?\s*([^\n]+)/i);
    if (dagMatch) {
      const rawChain = dagMatch[1];
      const parts = rawChain
        .split(/→|->/)
        .map(s => s.replace(/[`*_\s]/g, '').trim())
        .filter(Boolean);
      if (parts.length >= 5) {
        // Reversed so base/shared has index 0, top (demo) has highest index
        return parts.reverse();
      }
    }

    // 2. Fallback: Parse numbered list: 1. `core/`: ...
    const lines = content.split('\n');
    const layers = [];
    for (const line of lines) {
      const match = line.match(/^\s*\d+\.\s+[*`]*(?:src\/)?([a-zA-Z0-9_-]+)\/?[*`]*\s*:/);
      if (match && match[1]) {
        layers.push(match[1]);
      }
    }
    if (layers.length >= 5) {
      // In numbered list: core(1) -> ... -> shared(9) -> demo(10). Ensure shared is at bottom.
      const withoutShared = layers.filter(l => l !== 'shared');
      return ['shared', ...withoutShared];
    }
  } catch (_) {}

  return DEFAULT_DAG;
}

const layerOrder = getLayerHierarchy();

function getLayerName(filePath) {
  const rel = path.relative(srcDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

const pluginsDir = path.join(srcDir, 'plugins');
function getPluginSubdir(filePath) {
  const rel = path.relative(pluginsDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

// 4. Scan all source files & imports
const offendingImports = [];
const layerViolations = [];
const pluginViolations = [];
const allSourceFiles = new Set();
const usedFiles = new Set();

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const importRegex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  const currentLayer = getLayerName(filePath);
  const fromPlugin = getPluginSubdir(filePath);

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2] || match[3];
    if (!importPath) continue;

    let resolved = importPath;
    for (const [alias, aliasPath] of Object.entries(aliases)) {
      if (importPath === alias) {
        resolved = aliasPath;
        break;
      } else if (importPath.startsWith(alias + '/')) {
        resolved = path.join(aliasPath, importPath.slice(alias.length + 1));
        break;
      }
    }

    if (importPath.startsWith('.')) {
      resolved = path.resolve(path.dirname(filePath), importPath);
    }

    if (path.isAbsolute(resolved)) {
      const resolvedFile = resolveImportToFile(resolved);
      if (resolvedFile) {
        usedFiles.add(path.resolve(resolvedFile));

        const importedLayer = getLayerName(resolvedFile);
        const toPlugin = getPluginSubdir(resolvedFile);

        // A. Plugin Isolation check: Zero Cross-Imports between plugins
        if (fromPlugin && toPlugin && fromPlugin !== toPlugin) {
          pluginViolations.push({
            file: path.relative(workspaceRoot, filePath),
            fromPlugin,
            toPlugin,
            importPath,
          });
        }

        // B. Pure computation layers (core, schema, model) must never import UI / React from shared/ui
        const pureComputationLayers = ['core', 'schema', 'model'];
        if (currentLayer && pureComputationLayers.includes(currentLayer)) {
          const relToSrc = path.relative(srcDir, resolvedFile).replace(/\\/g, '/');
          if (relToSrc.startsWith('shared/ui')) {
            layerViolations.push({
              file: path.relative(workspaceRoot, filePath),
              currentLayer,
              importedLayer: 'shared/ui',
              importPath,
            });
          }
        }

        // C. DAG check: Lower layers must not import higher layers
        if (currentLayer && importedLayer && currentLayer !== importedLayer) {
          const isBaseUtility = importedLayer === 'shared' && !pureComputationLayers.includes(currentLayer);
          if (!isBaseUtility) {
            const currentIndex = layerOrder.indexOf(currentLayer);
            const importedIndex = layerOrder.indexOf(importedLayer);
            // Lower index = deeper layer. Lower layer cannot import higher layer.
            if (currentIndex !== -1 && importedIndex !== -1 && currentIndex < importedIndex) {
              layerViolations.push({
                file: path.relative(workspaceRoot, filePath),
                currentLayer,
                importedLayer,
                importPath,
              });
            }
          }
        }
      }

      // D. Check cross-module deep imports
      for (const mod of modules) {
        if (filePath.startsWith(mod + path.sep) || filePath === mod) {
          continue;
        }

        const relative = path.relative(mod, resolved);
        const isInside = !relative.startsWith('..') && !path.isAbsolute(relative) && relative !== '';

        if (isInside) {
          const relativeLower = relative.toLowerCase().replace(/\\/g, '/');
          const isEntryFile =
            relativeLower === 'index' ||
            relativeLower === 'index.ts' ||
            relativeLower === 'index.tsx' ||
            relativeLower === 'types' ||
            relativeLower === 'types.ts';

          // Check if resolved target is itself a submodule's entry point
          const normResolved = path.resolve(resolvedFile);
          const isSubmoduleEntry = modules.some(m => {
            const entryTs = path.resolve(m, 'index.ts');
            const entryTsx = path.resolve(m, 'index.tsx');
            return normResolved === entryTs || normResolved === entryTsx;
          });

          if (!isEntryFile && !isSubmoduleEntry) {
            offendingImports.push({
              file: path.relative(workspaceRoot, filePath),
              importPath,
              modulePath: path.relative(workspaceRoot, mod),
              resolvedSubpath: relativeLower,
            });
          }
        }
      }
    }
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (
        file === 'node_modules' ||
        file === '.git' ||
        file === '.archives' ||
        file === 'dist'
      ) {
        return;
      }
      walk(fullPath);
    } else {
      const ext = path.extname(file);
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        allSourceFiles.add(path.resolve(fullPath));
        checkFile(fullPath);
      }
    }
  });
}

walk(srcDir);

// 5. Dead Code Inspection
const deadFiles = [];
const standardEntryPoints = [
  path.join(srcDir, 'main.tsx'),
  path.join(srcDir, 'index.tsx'),
  path.join(srcDir, 'main.ts'),
  path.join(srcDir, 'index.ts'),
  path.join(srcDir, 'main.jsx'),
  path.join(srcDir, 'index.jsx'),
  path.join(srcDir, 'main.js'),
  path.join(srcDir, 'index.js'),
  path.join(srcDir, 'App.tsx'),
  path.join(srcDir, 'App.jsx'),
  path.join(srcDir, 'vite-env.d.ts'),
  path.join(srcDir, 'env.d.ts'),
];

// Check package.json entry points
try {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    [pkg.main, pkg.module, pkg.source].filter(Boolean).forEach(entry => {
      standardEntryPoints.push(path.resolve(workspaceRoot, entry));
    });
  }
} catch (_) {}

// Layer public entry points
modules.forEach(mod => {
  standardEntryPoints.push(path.join(mod, 'index.ts'));
  standardEntryPoints.push(path.join(mod, 'index.tsx'));
  standardEntryPoints.push(path.join(mod, 'index.js'));
  standardEntryPoints.push(path.join(mod, 'index.jsx'));
});

const normalizedEntryPoints = new Set(standardEntryPoints.map(p => path.resolve(p)));

function isInsidePackedModule(filePath) {
  let currentDir = path.dirname(filePath);
  while (currentDir.startsWith(srcDir)) {
    if (fs.existsSync(path.join(currentDir, 'index.js')) && fs.existsSync(path.join(currentDir, '.archives'))) {
      return true;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return false;
}

allSourceFiles.forEach(file => {
  if (normalizedEntryPoints.has(file)) return;
  if (file.endsWith('.d.ts')) return;

  const filename = path.basename(file);
  if (filename === 'vite-env.d.ts' || filename === 'env.d.ts') return;

  if (
    filename.includes('.test.') ||
    filename.includes('.spec.') ||
    filename === 'setupTests.ts' ||
    filename === 'setupTests.js'
  ) {
    return;
  }

  if (isInsidePackedModule(file)) return;

  if (!usedFiles.has(file)) {
    deadFiles.push(path.relative(workspaceRoot, file));
  }
});

let hasErrors = false;

if (pluginViolations.length > 0) {
  console.error('\n[PLUGIN ISOLATION ERROR] Found illegal cross-plugin imports (violating docs/project-rules.md):');
  pluginViolations.forEach(item => {
    console.error(`  - File:       ${item.file} (Plugin: ${item.fromPlugin})`);
    console.error(`    Import:     ${item.importPath} (Points to plugin: ${item.toPlugin})`);
  });
  console.error('\nPlugins must be completely isolated and interact strictly via EventBus & PluginContext.\n');
  hasErrors = true;
}

if (layerViolations.length > 0) {
  console.error('\n[ARCH DAG ERROR] Found illegal upward layer imports (violating docs/architecture.md):');
  layerViolations.forEach(item => {
    console.error(`  - File:   ${item.file} (Layer: ${item.currentLayer})`);
    console.error(`    Import: ${item.importPath} (Illegal dependency on higher layer: ${item.importedLayer})`);
  });
  console.error('\nLower/pure layers must never import higher UI or orchestration layers.\n');
  hasErrors = true;
}

if (offendingImports.length > 0) {
  console.error('\n[ARCH ERROR] Found illegal cross-module internal imports:');
  offendingImports.forEach(item => {
    console.error(`  - File:   ${item.file}`);
    console.error(`    Module: ${item.modulePath}`);
    console.error(`    Import: ${item.importPath} (points to internal: ${item.resolvedSubpath})`);
  });
  console.error("\nFix these imports to go through the module's public index file.\n");
  hasErrors = true;
}

if (deadFiles.length > 0) {
  console.error('\n[DEAD CODE ERROR] Found unused (dead) files:');
  deadFiles.forEach(file => {
    console.error(`  - ${file}`);
  });
  console.error('\nRemove these files or import them if they are needed.\n');
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
} else {
  console.log('[ARCH CHECK] All imports conform to architectural rules and DAG. No dead files found.');
  process.exit(0);
}



