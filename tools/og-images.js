#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

async function buildOgImages(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '..'));
  const outputDir = path.resolve(options.outputDir || path.join(projectRoot, '.cache', 'og-images'));
  const width = Number(options.width || DEFAULT_WIDTH);
  const height = Number(options.height || DEFAULT_HEIGHT);
  const site = options.site || {};
  const posts = Array.isArray(options.posts) ? options.posts : [];
  const fontDir = path.join(projectRoot, 'node_modules', 'hexo-theme-a4', 'source', 'fonts');
  const regularFont = readFont(path.join(fontDir, 'LXGWWenKaiLite-Regular.woff2'));
  const boldFont = readFont(path.join(fontDir, 'LXGWWenKaiLite-Bold.woff2'));

  fs.mkdirSync(outputDir, { recursive: true });
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.png')) fs.rmSync(path.join(outputDir, entry.name));
  }

  const cards = [];
  cards.push(await renderCard({
    outputDir,
    key: 'site',
    width,
    height,
    title: site.title || 'Mau-Q',
    description: site.description || '',
    eyebrow: site.subtitle || '学习 · 记录 · 成长',
    footer: new URL(site.url || 'https://mau-q.github.io').host,
    regularFont,
    boldFont
  }));

  for (const post of posts) {
    const routePath = String(post.path || '').trim();
    if (!routePath) continue;
    const categories = normalizeCollection(post.categories);
    const dateText = formatDate(post.date);
    cards.push(await renderCard({
      outputDir,
      key: safeOgKey(routePath),
      width,
      height,
      title: String(post.title || '未命名文章'),
      description: plainText(post.description || post.excerpt || post.content || ''),
      eyebrow: categories[0] || '文章',
      footer: [dateText, site.title || 'Mau-Q'].filter(Boolean).join(' · '),
      regularFont,
      boldFont
    }));
  }

  return { outputDir, cards, width, height };
}

async function renderCard(options) {
  const outputFile = path.join(options.outputDir, `${options.key}.png`);
  const svg = createCardSvg(options);
  await sharp(Buffer.from(svg))
    .resize(options.width, options.height)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputFile);
  return { key: options.key, outputFile, bytes: fs.statSync(outputFile).size };
}

function createCardSvg(options) {
  const titleLines = wrapText(options.title, 18, 3);
  const descriptionLines = wrapText(options.description, 34, 2);
  const titleStartY = titleLines.length === 1 ? 284 : titleLines.length === 2 ? 245 : 210;
  const titleSvg = titleLines.map((line, index) => (
    `<text x="96" y="${titleStartY + index * 82}" class="title">${escapeXml(line)}</text>`
  )).join('');
  const descriptionStartY = titleStartY + titleLines.length * 82 + 28;
  const descriptionSvg = descriptionLines.map((line, index) => (
    `<text x="96" y="${descriptionStartY + index * 42}" class="description">${escapeXml(line)}</text>`
  )).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`,
    '<defs>',
    '<style>',
    `@font-face{font-family:MauQWenKai;src:url(data:font/woff2;base64,${options.regularFont}) format('woff2');font-weight:400;}`,
    `@font-face{font-family:MauQWenKai;src:url(data:font/woff2;base64,${options.boldFont}) format('woff2');font-weight:700;}`,
    '.title{font-family:MauQWenKai,serif;font-size:66px;font-weight:700;fill:#161b26;}',
    '.description{font-family:MauQWenKai,serif;font-size:28px;font-weight:400;fill:#566075;}',
    '.meta{font-family:MauQWenKai,serif;font-size:25px;font-weight:700;letter-spacing:4px;fill:#315fb5;}',
    '.footer{font-family:MauQWenKai,serif;font-size:23px;font-weight:400;fill:#687184;}',
    '</style>',
    '</defs>',
    '<rect width="1200" height="630" fill="#f7f4ea"/>',
    '<rect x="42" y="42" width="1116" height="546" rx="18" fill="#fffdf8" stroke="#d9d5c8" stroke-width="2"/>',
    '<rect x="96" y="90" width="72" height="7" rx="3.5" fill="#315fb5"/>',
    `<text x="96" y="151" class="meta">${escapeXml(String(options.eyebrow || '文章').toUpperCase())}</text>`,
    titleSvg,
    descriptionSvg,
    '<line x1="96" y1="522" x2="1104" y2="522" stroke="#ded9cd" stroke-width="2"/>',
    `<text x="96" y="563" class="footer">${escapeXml(options.footer || '')}</text>`,
    '<text x="1104" y="563" text-anchor="end" class="footer">学习 · 记录 · 成长</text>',
    '</svg>'
  ].join('');
}

function safeOgKey(routePath) {
  return String(routePath || '')
    .replace(/index\.html$/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[\\/]+/g, '--')
    .replace(/[^A-Za-z0-9._-]/g, '-') || 'site';
}

function wrapText(value, maxUnits, maxLines) {
  const input = plainText(value);
  if (!input) return [];
  const lines = [];
  let current = '';
  let units = 0;
  for (const character of Array.from(input)) {
    const nextUnits = visualUnits(character);
    if (current && units + nextUnits > maxUnits) {
      lines.push(current.trim());
      current = '';
      units = 0;
      if (lines.length === maxLines) break;
    }
    current += character;
    units += nextUnits;
  }
  if (lines.length < maxLines && current.trim()) lines.push(current.trim());

  const consumed = lines.join('').length;
  if (consumed < input.length && lines.length) {
    const lastLine = Array.from(lines[lines.length - 1]);
    lastLine.pop();
    lines[lines.length - 1] = `${lastLine.join('').replace(/[，。；、,.!?！？\s]+$/, '')}…`;
  }
  return lines;
}

function visualUnits(character) {
  return /[\u0000-\u00ff]/.test(character) ? 0.55 : 1;
}

function plainText(value) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')
    .replace(/^\s*>+\s?/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/[`*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCollection(collection) {
  if (!collection) return [];
  const values = typeof collection.toArray === 'function'
    ? collection.toArray()
    : Array.isArray(collection.data)
      ? collection.data
      : Array.isArray(collection)
        ? collection
        : [];
  return values.map(item => String(item && item.name ? item.name : item)).filter(Boolean);
}

function formatDate(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, '0'), String(parsed.getDate()).padStart(2, '0')].join('-');
}

function readFont(file) {
  if (!fs.existsSync(file)) throw new Error(`OG font not found: ${file}`);
  return fs.readFileSync(file).toString('base64');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  buildOgImages,
  createCardSvg,
  plainText,
  safeOgKey,
  wrapText
};
