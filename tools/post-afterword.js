#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

function loadAfterwordConfig(projectRoot) {
  const file = path.join(projectRoot, 'resources', 'post-afterwords.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(config.rules) || !Array.isArray(config.default)) {
    throw new Error('post-afterwords.json must contain rules and default arrays');
  }
  return config;
}

function selectAfterword(data, config) {
  if (data.afterword === false) return null;
  if (typeof data.afterword === 'string' && data.afterword.trim()) {
    return { text: data.afterword.trim(), author: '', title: '' };
  }
  if (data.afterword && typeof data.afterword === 'object' && data.afterword.text) {
    return normalizePoem(data.afterword);
  }

  const context = [
    data.title,
    ...normalizeTerms(data.categories),
    ...normalizeTerms(data.tags)
  ].filter(Boolean).join(' ');
  const matched = config.rules.find(rule =>
    Array.isArray(rule.keywords) &&
    rule.keywords.some(keyword => context.includes(String(keyword)))
  );
  const poems = matched && Array.isArray(matched.poems) && matched.poems.length
    ? matched.poems
    : config.default;
  if (!Array.isArray(poems) || !poems.length) return null;

  const seed = String(data.path || data.slug || data.title || context || 'post');
  return normalizePoem(poems[stableHash(seed) % poems.length]);
}

function renderAfterword(poem) {
  if (!poem || !poem.text) return '';
  const source = [poem.author, poem.title ? `《${poem.title}》` : '']
    .filter(Boolean)
    .join('');
  return [
    '',
    '<aside class="post-afterword" aria-label="文章余韵">',
    '  <span class="post-afterword-label">文章余韵</span>',
    `  <p>${escapeHtml(poem.text)}</p>`,
    source ? `  <cite>—— ${escapeHtml(source)}</cite>` : '',
    '</aside>',
    ''
  ].filter(line => line !== '').join('\n');
}

function normalizeTerms(value) {
  if (!value) return [];
  const items = Array.isArray(value)
    ? value
    : Array.isArray(value.data)
      ? value.data
      : [value];
  return items.map(item => {
    if (item && typeof item === 'object') return String(item.name || item.title || '');
    return String(item || '');
  }).filter(Boolean);
}

function normalizePoem(poem) {
  return {
    text: String(poem.text || '').trim(),
    author: String(poem.author || '').trim(),
    title: String(poem.title || '').trim()
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  loadAfterwordConfig,
  normalizeTerms,
  renderAfterword,
  selectAfterword,
  stableHash
};
