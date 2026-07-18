#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const sourcePostsDir = path.join(projectRoot, 'source', '_posts');
const obsidianConfigPath = path.join(projectRoot, 'obsidian-blog.config.json');
const obsidianConfig = readJson(obsidianConfigPath, {});
const obsidianVaultDir = process.env.OBSIDIAN_VAULT || resolveFrom(projectRoot, obsidianConfig.vaultDir || '../../rui');
const obsidianBlogsDir = process.env.OBSIDIAN_BLOGS_DIR || resolveFrom(obsidianVaultDir, obsidianConfig.blogsDir || 'Blogs');

const expectedPublicFiles = [
  'sitemap.xml',
  'atom.xml',
  'robots.txt',
  'posts/2026/index.html',
  'posts/hello-world/index.html'
];

const externalPatterns = [
  ['remote script src', /<script\b[^>]*\bsrc=["']https?:\/\//i],
  ['remote link href', /<link\b[^>]*\bhref=["']https?:\/\//i],
  ['remote css url', /url\(\s*["']?https?:\/\//i],
  ['remote css import', /@import\s+(?:url\()?\s*["']?https?:\/\//i]
];

const contentRiskPatterns = [
  ['unresolved Obsidian embed', /!\[\[[^\]]+\]\]/],
  ['unresolved Obsidian wikilink', /\[\[[^\]]+\]\]/],
  ['remote markdown image', /!\[[^\]]*\]\(\s*https?:\/\//i],
  ['local file path', /(file:\/\/|\/Users\/rui\/)/],
  ['TODO', /\bTODO\b/i],
  ['FIXME', /\bFIXME\b/i],
  ['unfinished draft marker', /待补|待完善|未完成|草稿/],
  ['password or secret', /密码|password|passwd|secret|token/i],
  ['account', /账号|账户|account/i],
  ['id card', /身份证/],
  ['phone number', /手机号|电话[:：]?\s*1[3-9]\d{9}|(^|[^\d])1[3-9]\d{9}([^\d]|$)/],
  ['localhost', /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i]
];

const errors = [];
const externalReferences = [];

main();

function main() {
  checkExpectedPublicFiles();
  scanPublicFiles();
  scanMarkdownFiles(sourcePostsDir, () => true);
  scanMarkdownFiles(obsidianBlogsDir, isReadyObsidianBlog);

  if (externalReferences.length) {
    console.log(`External references (${externalReferences.length}):`);
    for (const item of externalReferences) {
      console.log(`- ${item.file}:${item.line}: ${item.label}: ${item.text}`);
    }
  } else {
    console.log('0 external references');
  }

  if (errors.length) {
    console.error(`Doctor failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Doctor passed');
}

function checkExpectedPublicFiles() {
  if (!fs.existsSync(publicDir)) {
    errors.push('public/ does not exist. Run npm run build or npm run blog:ready first.');
    return;
  }

  for (const file of expectedPublicFiles) {
    const fullPath = path.join(publicDir, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Missing generated file: public/${file}`);
    }
  }
}

function scanPublicFiles() {
  if (!fs.existsSync(publicDir)) return;

  const files = walkFiles(publicDir).filter(file => /\.(html|css|js)$/i.test(file));
  for (const file of files) {
    const rel = toPosix(path.relative(projectRoot, file));
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [label, regex] of externalPatterns) {
        regex.lastIndex = 0;
        if (regex.test(line)) {
          externalReferences.push({ file: rel, line: i + 1, label, text: line.trim().slice(0, 140) });
        }
      }
      if (file.endsWith('.html') && /\[\[[^\]]+\]\]/.test(line)) {
        errors.push(`${rel}:${i + 1}: unresolved Obsidian wikilink in generated output`);
      }
      if (/(file:\/\/|\/Users\/rui\/)/.test(line)) {
        errors.push(`${rel}:${i + 1}: local filesystem path in generated output`);
      }
    }
  }
}

function scanMarkdownFiles(root, shouldScan) {
  if (!fs.existsSync(root)) return;
  const files = walkFiles(root).filter(file => file.endsWith('.md'));
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = parseFrontMatter(raw);
    if (!shouldScan(parsed, file)) continue;

    const rel = toPosix(path.relative(projectRoot, file));
    for (const [label, regex] of contentRiskPatterns) {
      const match = findPatternOutsideCode(parsed.body, regex);
      if (match) {
        errors.push(`${rel}:${match.line}: ${label}: ${match.text}`);
      }
    }
  }
}

function isReadyObsidianBlog(parsed) {
  return parsed.data.blog === true && String(parsed.data.status || '').toLowerCase() === 'ready';
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { data: {}, body: raw };
  try {
    const data = yaml.load(match[1]) || {};
    return { data: typeof data === 'object' && !Array.isArray(data) ? data : {}, body: raw.slice(match[0].length) };
  } catch (_) {
    return { data: {}, body: raw };
  }
}

function findPatternOutsideCode(markdown, regex) {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    regex.lastIndex = 0;
    if (regex.test(line)) {
      return { line: i + 1, text: line.trim().slice(0, 120) };
    }
  }
  return null;
}

function walkFiles(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'node_modules') continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function resolveFrom(base, value) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
