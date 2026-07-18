#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const subsetFont = require('subset-font');

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

  const results = [];
  for (const fontName of FONT_NAMES) {
    const sourceFile = path.join(themeFontDir, fontName);
    if (!fs.existsSync(sourceFile)) {
      throw new Error(`Font source not found: ${sourceFile}`);
    }

    const original = fs.readFileSync(sourceFile);
    const subset = await subsetFont(original, subsetText, {
      targetFormat: 'woff2',
      preserveNameIds: [0, 1, 2, 3, 4, 5, 6]
    });
    const outputFile = path.join(outputDir, fontName);
    fs.writeFileSync(outputFile, subset);

    results.push({
      fontName,
      outputFile,
      originalBytes: original.length,
      subsetBytes: subset.length
    });
  }

  return { projectRoot, outputDir, subsetText, results };
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
