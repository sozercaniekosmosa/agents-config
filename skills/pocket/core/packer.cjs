/**
 * @file packer.cjs
 * ZIP packing and unpacking using JSZip.
 * Supports preserving empty directories, previewing targets, and fallback to .pocket on collision/lock.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Loads JSZip safely from local or repo node_modules.
 * @param {string} projectRoot
 * @returns {typeof import('jszip')}
 */
function loadJSZip(projectRoot) {
  try {
    return require('jszip');
  } catch {
    const localPath = path.join(projectRoot, 'node_modules', 'jszip');
    return require(localPath);
  }
}

/**
 * Converts a filesystem path to a clean relative POSIX path for the archive.
 * @param {string} fullPath
 * @param {string} projectRoot
 * @returns {string}
 */
function toArchiveRelativePath(fullPath, projectRoot) {
  const rel = path.relative(projectRoot, fullPath);
  return rel.split(path.sep).join('/');
}

/**
 * Recursively scans directory and adds all files and empty directories to zip.
 * @param {string} dirPath
 * @param {string} projectRoot
 * @param {import('jszip')} zip
 * @param {string[]} manifest
 */
function addDirectoryToZip(dirPath, projectRoot, zip, manifest) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  const relDirPath = toArchiveRelativePath(dirPath, projectRoot);
  if (entries.length === 0) {
    // Empty directory: register folder entry
    zip.folder(relDirPath);
    manifest.push(`${relDirPath}/ (empty directory)`);
    return;
  }

  for (const entry of entries) {
    const fullEntryPath = path.join(dirPath, entry.name);
    const relEntryPath = toArchiveRelativePath(fullEntryPath, projectRoot);

    if (entry.isDirectory()) {
      addDirectoryToZip(fullEntryPath, projectRoot, zip, manifest);
    } else if (entry.isFile()) {
      const fileData = fs.readFileSync(fullEntryPath);
      zip.file(relEntryPath, fileData);
      manifest.push(relEntryPath);
    }
  }
}

/**
 * Packs specified paths into a ZIP Buffer.
 * @param {string[]} targetPaths
 * @param {string} projectRoot
 * @returns {Promise<{ buffer: Buffer, manifest: string[] }>}
 */
async function packPaths(targetPaths, projectRoot) {
  const JSZip = loadJSZip(projectRoot);
  const zip = new JSZip();
  const manifest = [];

  for (const rawPath of targetPaths) {
    const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, rawPath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${rawPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    const relPath = toArchiveRelativePath(resolvedPath, projectRoot);

    if (stat.isDirectory()) {
      addDirectoryToZip(resolvedPath, projectRoot, zip, manifest);
    } else if (stat.isFile()) {
      const fileData = fs.readFileSync(resolvedPath);
      zip.file(relPath, fileData);
      manifest.push(relPath);
    }
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  return { buffer, manifest };
}

/**
 * Unpacks a ZIP buffer into the project root with auto-replace and fallback to .pocket.
 * @param {Buffer} zipBuffer
 * @param {string} projectRoot
 * @returns {Promise<{
 *   preview: Array<{ path: string, target: string, isDir: boolean }>,
 *   restored: Array<{ path: string, target: string }>,
 *   collided: Array<{ path: string, target: string, error: string }>
 * }>}
 */
async function unpackArchive(zipBuffer, projectRoot) {
  const JSZip = loadJSZip(projectRoot);
  const zip = await JSZip.loadAsync(zipBuffer);

  const preview = [];
  const entries = Object.keys(zip.files);

  // 1. Build preview list
  for (const name of entries) {
    const file = zip.files[name];
    const safeRelPath = name.replace(/^(\.\.[\/\\])+/, ''); // prevent path traversal
    const targetPath = path.join(projectRoot, safeRelPath);
    preview.push({
      path: name,
      target: targetPath,
      isDir: file.dir
    });
  }

  // 2. Perform restoration
  const restored = [];
  const collided = [];

  for (const item of preview) {
    const file = zip.files[item.path];

    if (item.isDir) {
      try {
        fs.mkdirSync(item.target, { recursive: true });
        restored.push({ path: item.path, target: item.target });
      } catch (err) {
        const fallbackTarget = path.join(projectRoot, '.pocket', item.path);
        fs.mkdirSync(fallbackTarget, { recursive: true });
        collided.push({ path: item.path, target: fallbackTarget, error: err.message });
      }
      continue;
    }

    // File entry
    const content = await file.async('nodebuffer');
    try {
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      fs.writeFileSync(item.target, content);
      restored.push({ path: item.path, target: item.target });
    } catch (writeErr) {
      // Collision / access error fallback
      const fallbackTarget = path.join(projectRoot, '.pocket', item.path);
      try {
        fs.mkdirSync(path.dirname(fallbackTarget), { recursive: true });
        fs.writeFileSync(fallbackTarget, content);
        collided.push({ path: item.path, target: fallbackTarget, error: writeErr.message });
      } catch (fbErr) {
        collided.push({ path: item.path, target: fallbackTarget, error: `${writeErr.message} (Fallback failed: ${fbErr.message})` });
      }
    }
  }

  return { preview, restored, collided };
}

module.exports = {
  packPaths,
  unpackArchive
};
