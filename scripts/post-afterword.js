/**
 * Render one deterministic, locally configured poem after the post body without
 * changing page.content, word counts, SEO descriptions or feed summaries.
 * Front matter can set afterword: false or provide a custom string/object.
 */
'use strict';

const {
  createAfterwordRenderer,
  loadAfterwordConfig,
} = require('../tools/post-afterword');

const config = loadAfterwordConfig(hexo.base_dir);
const render = createAfterwordRenderer(config);

hexo.extend.helper.register('post_afterword', function (page) {
  return render(page);
});
