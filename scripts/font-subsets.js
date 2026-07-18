/**
 * Build deterministic LXGW WenKai subsets from all publishable text and replace
 * the theme's full font routes after Hexo has generated the site.
 */
'use strict';

const fs = require('fs');
const { buildFontSubsets } = require('../tools/font-subsets');

let generatedSubsets = [];

hexo.extend.filter.register('before_generate', async function () {
  const result = await buildFontSubsets({ projectRoot: hexo.base_dir });
  generatedSubsets = result.results;

  for (const item of generatedSubsets) {
    const saved = 100 - (item.subsetBytes / item.originalBytes * 100);
    hexo.log.info(
      'font-subsets: %s %dK -> %dK (%d%% smaller)',
      item.fontName,
      Math.round(item.originalBytes / 1024),
      Math.round(item.subsetBytes / 1024),
      Math.round(saved)
    );
  }
});

hexo.extend.filter.register('after_generate', function () {
  for (const item of generatedSubsets) {
    hexo.route.set(`fonts/${item.fontName}`, fs.readFileSync(item.outputFile));
  }
});
