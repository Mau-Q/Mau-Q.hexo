'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const css = fs.readFileSync(path.join(hexo.source_dir, 'css/code-theme.css'), 'utf8');
const version = createHash('sha256').update(css).digest('hex').slice(0, 12);

hexo.extend.helper.register('code_theme_css', () => css);
const darkReadingCss = fs.readFileSync(path.join(hexo.source_dir, 'css/dark-reading.css'), 'utf8');
hexo.extend.helper.register('dark_reading_css', () => darkReadingCss);
hexo.extend.filter.register('after_render:html', html =>
  html.replace('</head>', `<link rel="stylesheet" href="/css/code-theme.css?v=${version}"></head>`)
);
