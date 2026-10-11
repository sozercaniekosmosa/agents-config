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
      if (stat.isFile()) return resolvedPath;
    } catch (_) {}
  }
  for (const ext of extensions) {
    const p = resolvedPath + ext;
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        if (stat.isFile()) return p;
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

// 3. Scan all source files & imports
const offendingImports = [];
const layerViolations = [];
const allSourceFiles = new Set();
const usedFiles = new Set();

// Parse layer order from docs/architecture.md if present (e.g. DAG)
function getLayerHierarchy() {
  const archFile = path.join(workspaceRoot, 'docs/architecture.md');
  if (!fs.existsSync(archFile)) return null;

  const content = fs.readFileSync(archFile, 'utf8');
  // Match lines like: 1. `src/core/` or `core` -> ...
  const lines = content.split('\n');
  const layers = [];

  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s+\*\*`?(?:src\/)?([a-zA-Z0-9_-]+)\/?`?\*\*/);
    if (match && match[1]) {
      layers.push(match[1]);
    }
  }
  return layers.length > 0 ? layers : null;
}

const layerOrder = getLayerHierarchy(); // [core, schema, graph, store, canvas, components, shared, demo]

function getLayerName(filePath) {
  const rel = path.relative(srcDir, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const importRegex = /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  const currentLayer = getLayerName(filePath);

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

        // DAG check: Pure layers (e.g. core, schema) must not import higher layers
        if (currentLayer && layerOrder) {
          const importedLayer = getLayerName(resolvedFile);
          const isUtilityLayer = importedLayer === 'shared' || importedLayer === 'common' || importedLayer === 'utils' || importedLayer === 'lib';
          if (importedLayer && importedLayer !== currentLayer && !isUtilityLayer) {
            const currentIndex = layerOrder.indexOf(currentLayer);
            const importedIndex = layerOrder.indexOf(importedLayer);
            // Lower index = deeper/core layer. Core (0) cannot import canvas (4).
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

      // Check cross-module deep imports
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

          if (!isEntryFile) {
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

// 4. Dead Code Inspection
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

// Check package.json main/module/source entry points if defined
try {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    [pkg.main, pkg.module, pkg.source].filter(Boolean).forEach(entry => {
      standardEntryPoints.push(path.resolve(workspaceRoot, entry));
    });
  }
} catch (_) {}

// Add layer public entry points (contracts) as recognized entries
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

if (layerViolations.length > 0) {
  console.error('\n[ARCH DAG ERROR] Found illegal upward layer imports (violating DAG):');
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
