#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('node:crypto');
const subsetFont = require('subset-font');

const CACHE_SCHEMA_VERSION = 1;

const FONT_NAMES = [
  'LXGWWenKaiLite-Regular.woff2',
  'LXGWWenKaiLite-Bold.woff2'
];

const TEXT_EXTENSIONS = new Set([
  '.css', '.ejs', '.html', '.js', '.json', '.md', '.svg', '.txt', '.yml', '.yaml'
]);

async function buildFontSubsets(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.env.BLOG_PROJECT_ROOT || path.resolve(__dirname, '..'));
  const themeFontDir = path.join(projectRoot, 'node_modules', 'hexo-theme-a4', 'source', 'fonts');
  const outputDir = path.join(projectRoot, '.cache', 'font-subsets');
  const subsetText = collectSubsetText(projectRoot);

  fs.mkdirSync(outputDir, { recursive: true });

  const lockfilePath = path.join(projectRoot, 'package-lock.json');
  const dependencyFingerprint = hashBytes(
    fs.existsSync(lockfilePath) ? fs.readFileSync(lockfilePath) : Buffer.alloc(0)
  );
  const generatorFingerprint = hashBytes(fs.readFileSync(__filename));
  const manifestPath = path.join(outputDir, 'manifest.json');
  const previousManifest = readJsonFile(manifestPath);
  const canReuseCache = previousManifest &&
    previousManifest.schemaVersion === CACHE_SCHEMA_VERSION &&
    previousManifest.dependencyFingerprint === dependencyFingerprint &&
    previousManifest.generatorFingerprint === generatorFingerprint;
  const previousFonts = canReuseCache && previousManifest.fonts && typeof previousManifest.fonts === 'object'
    ? previousManifest.fonts
    : {};
  const nextFonts = {};
  const textFingerprint = hashBytes(Buffer.from(subsetText, 'utf8'));

  const results = [];
  for (const fontName of FONT_NAMES) {
    const sourceFile = path.join(themeFontDir, fontName);
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Font source not found: ${sourceFile}`);
    }

    const original = fs.readFileSync(sourceFile);
    const cacheKey = hashBytes(Buffer.from(JSON.stringify({
      schemaVersion: CACHE_SCHEMA_VERSION,
      dependencyFingerprint,
      generatorFingerprint,
      fontName,
      sourceFingerprint: hashBytes(original),
      textFingerprint,
      targetFormat: 'woff2',
      preserveNameIds: [0, 1, 2, 3, 4, 5, 6]
    }), 'utf8'));
    const outputFile = path.join(outputDir, fontName);

    const cachedEntry = previousFonts[fontName];
    if (cachedEntry && cachedEntry.cacheKey === cacheKey && fs.existsSync(outputFile)) {
      const cachedSubset = fs.readFileSync(outputFile);
      if (cachedSubset.length === cachedEntry.subsetBytes && hashBytes(cachedSubset) === cachedEntry.outputFingerprint) {
        results.push({
          fontName,
          outputFile,
          originalBytes: original.length,
          subsetBytes: cachedSubset.length,
          cacheHit: true
        });
        nextFonts[fontName] = cachedEntry;
        continue;
      }
    }

    const subset = await subsetFont(original, subsetText, {
      targetFormat: 'woff2',
      preserveNameIds: [0, 1, 2, 3, 4, 5, 6]
    });
    fs.writeFileSync(outputFile, subset);

    results.push({
      fontName,
      outputFile,
      originalBytes: original.length,
      subsetBytes: subset.length,
      cacheHit: false
    });
    nextFonts[fontName] = {
      cacheKey,
      subsetBytes: subset.length,
      outputFingerprint: hashBytes(subset)
    };
  }

  writeJsonFileAtomic(manifestPath, {
    schemaVersion: CACHE_SCHEMA_VERSION,
    dependencyFingerprint,
    generatorFingerprint,
    fonts: nextFonts
  });

  return { projectRoot, outputDir, subsetText, results };
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeJsonFileAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function collectSubsetText(projectRoot) {
  const roots = [
    path.join(projectRoot, 'source'),
    path.join(projectRoot, 'resources'),
    path.join(projectRoot, 'layout-overrides'),
    path.join(projectRoot, 'scaffolds')
  ];
  const files = [
    path.join(projectRoot, '_config.yml'),
    path.join(projectRoot, '_config.a4.yml'),
    path.join(projectRoot, 'blog-slug-dictionary.json'),
    path.join(projectRoot, 'obsidian-blog.config.json')
  ];

  for (const root of roots) {
    if (fs.existsSync(root)) files.push(...walkTextFiles(root));
  }

  const text = files
    .filter(file => fs.existsSync(file))
    .sort()
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');

  // Keep common whitespace, punctuation and replacement glyphs even when the
  // current content does not happen to contain them.
  const safetyCharacters = '\n\r\t \u00a0\u3000\u2026\u2014\u2013\u2018\u2019\u201c\u201d\ufffd';
  return Array.from(new Set(safetyCharacters + text)).join('');
}

function walkTextFiles(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkTextFiles(fullPath));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      result.push(fullPath);
    }
  }
  return result;
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

async function main() {
  const result = await buildFontSubsets();
  console.log(`Font subset characters: ${Array.from(result.subsetText).length}`);
  for (const item of result.results) {
    const saved = 100 - (item.subsetBytes / item.originalBytes * 100);
    console.log(
      `${item.fontName}: ${formatBytes(item.originalBytes)} -> ${formatBytes(item.subsetBytes)} (${saved.toFixed(1)}% smaller)`
    );
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  FONT_NAMES,
  buildFontSubsets,
  collectSubsetText
};
