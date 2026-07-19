#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { Solar } = require('lunar-javascript');

const TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

function buildSeasonalPoemPayload(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.env.BLOG_PROJECT_ROOT || path.resolve(__dirname, '..'));
  const sourceFile = path.join(projectRoot, 'resources', 'seasonal-poems.json');
  const startYear = options.startYear || 2020;
  const endYear = options.endYear || 2100;
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const poems = validatePoems(source.poems);

  return {
    version: 1,
    timezone: 'Asia/Shanghai',
    poems,
    years: buildSolarTermCalendar(startYear, endYear)
  };
}

function buildSolarTermCalendar(startYear, endYear) {
  const years = {};
  for (let year = startYear; year <= endYear; year += 1) {
    const dates = Array(TERMS.length).fill('');
    const table = Solar.fromYmd(year, 7, 1).getLunar().getJieQiTable();

    for (const solar of Object.values(table)) {
      if (solar.getYear() !== year) continue;
      const term = solar.getLunar().getJieQi();
      const index = TERMS.indexOf(term);
      if (index !== -1) dates[index] = solar.toYmd().slice(5);
    }

    const missing = dates
      .map((date, index) => date ? null : TERMS[index])
      .filter(Boolean);
    if (missing.length) {
      throw new Error(`Missing solar terms for ${year}: ${missing.join(', ')}`);
    }
    years[String(year)] = dates;
  }
  return years;
}

function validatePoems(poems) {
  if (!Array.isArray(poems) || poems.length !== TERMS.length) {
    throw new Error(`seasonal-poems.json must contain exactly ${TERMS.length} poems`);
  }

  return TERMS.map((term, index) => {
    const poem = poems[index] || {};
    if (poem.term !== term) {
      throw new Error(`Expected solar term ${term} at index ${index}, received ${poem.term || 'empty'}`);
    }
    for (const field of ['text', 'author', 'title']) {
      if (!String(poem[field] || '').trim()) {
        throw new Error(`Solar term ${term} is missing ${field}`);
      }
    }
    return {
      term,
      text: String(poem.text).trim(),
      author: String(poem.author).trim(),
      title: String(poem.title).trim()
    };
  });
}

if (require.main === module) {
  const payload = buildSeasonalPoemPayload();
  console.log(`Generated ${Object.keys(payload.years).length} years × ${payload.poems.length} solar terms`);
}

module.exports = {
  TERMS,
  buildSeasonalPoemPayload,
  buildSolarTermCalendar,
  validatePoems
};
