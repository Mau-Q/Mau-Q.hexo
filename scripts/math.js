'use strict';

const fs = require('node:fs');
const path = require('node:path');
const markedKatex = require('marked-katex-extension');

// Tokenize math before Markdown so subscripts and matrix rows remain intact.
hexo.extend.filter.register('marked:extensions', extensions => {
  extensions.push(...markedKatex({ nonStandard: true, throwOnError: true }).extensions);
});

hexo.extend.generator.register('math-assets', () => {
  const dist = path.dirname(require.resolve('katex/dist/katex.min.css'));
  const files = ['katex.min.css', ...fs.readdirSync(path.join(dist, 'fonts')).map(name => `fonts/${name}`)];
  return files.map(file => ({
    path: `lib/katex/${file}`,
    data: () => fs.createReadStream(path.join(dist, file))
  }));
});

hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('class="katex"')) return html;
  return html.replace('</head>', '<link rel="stylesheet" href="/lib/katex/katex.min.css"></head>');
});
