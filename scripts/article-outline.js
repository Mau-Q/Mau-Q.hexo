'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Change resource URLs with their contents so cached styles cannot undo a fix.
function version(file) {
  return createHash('sha256').update(fs.readFileSync(path.join(hexo.source_dir, file))).digest('hex').slice(0, 12);
}

hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('id="toc"')) return html;
  const css = `/css/article-outline.css?v=${version('css/article-outline.css')}`;
  return html
    .replace(/src="\/js\/toc\.js(?:\?[^\"]*)?"/g, `src="/js/toc.js?v=${version('js/toc.js')}"`)
    .replace('</head>', `<link rel="stylesheet" href="${css}"></head>`);
});
