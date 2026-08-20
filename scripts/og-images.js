/**
 * Generate local Chinese Open Graph cards from the current Hexo post data and
 * expose them as virtual routes. Nothing is written into source/.
 */
'use strict';

const fs = require('node:fs');
const { buildOgImages } = require('../tools/og-images');

let generatedCards = [];

hexo.extend.filter.register('before_generate', async function () {
  const experience = hexo.theme.config.experience || {};
  const seo = experience.seo || {};
  const result = await buildOgImages({
    projectRoot: hexo.base_dir,
    width: seo.ogImageWidth,
    height: seo.ogImageHeight,
    site: {
      title: hexo.config.title,
      subtitle: hexo.config.subtitle,
      description: hexo.config.description,
      url: hexo.config.url
    },
    posts: hexo.locals.get('posts').toArray()
  });

  generatedCards = result.cards;
  hexo.log.info('og-images: generated %d local share cards', generatedCards.length);
});

hexo.extend.filter.register('after_generate', function () {
  for (const card of generatedCards) {
    hexo.route.set(`img/og/${card.key}.png`, fs.readFileSync(card.outputFile));
  }
});
