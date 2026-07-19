/**
 * Generate a compact 2020-2100 solar-term calendar at build time. The homepage
 * uses it to replace the normal local poem only on the exact solar-term date.
 */
'use strict';

const { buildSeasonalPoemPayload } = require('../tools/seasonal-poems');

hexo.extend.generator.register('seasonal-poems', function () {
  const payload = buildSeasonalPoemPayload({ projectRoot: hexo.base_dir });
  return {
    path: 'data/solar-terms.json',
    data: JSON.stringify(payload)
  };
});
