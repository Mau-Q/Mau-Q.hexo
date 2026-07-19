/**
 * Render one deterministic, locally configured poem after the post body without
 * changing page.content, word counts, SEO descriptions or feed summaries.
 * Front matter can set afterword: false or provide a custom string/object.
 */
'use strict';

const {
  loadAfterwordConfig,
  renderAfterword,
  selectAfterword
} = require('../tools/post-afterword');

const config = loadAfterwordConfig(hexo.base_dir);

hexo.extend.helper.register('post_afterword', function (page) {
  const poem = selectAfterword(page, config);
  return poem ? renderAfterword(poem) : '';
});
