/**
 * Theme patch: override A4 theme layout templates with local versions.
 * Local templates are stored in layout-overrides/ (mirrors theme's layout/ structure).
 * This survives npm install because the overrides are in project source, not node_modules.
 *
 * Patches applied:
 *  - head.ejs:     remove CDN Chinese font CSS link (use local @font-face instead)
 *  - layout.ejs:   use local /js/darkreader.min.js instead of jsdelivr CDN
 *  - footer.ejs:   use local jQuery and the local 1,000-line poetry library
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OVERRIDES_DIR = path.join(__dirname, '..', 'layout-overrides');

const OVERRIDES = [
  'layout.ejs',
  '_partial/head.ejs',
  '_partial/footer.ejs',
];

hexo.on('generateBefore', function () {
  OVERRIDES.forEach(function (view) {
    const filePath = path.join(OVERRIDES_DIR, view);
    if (!fs.existsSync(filePath)) {
      throw new Error(`theme-patch: missing override ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    hexo.theme.setView(view, content);
    hexo.log.info('theme-patch: overrode %s', view);
  });
});

// Drop theme assets that this site never loads (darkMode uses darkreader,
// hitokoto/comments are disabled, randomHeaderContent is replaced by randomPoem).
hexo.extend.filter.register('after_generate', function () {
  const theme = hexo.theme.config || {};
  const unused = ['js/darkmode-js.min.js', 'js/randomHeaderContent.js'];

  if (!(theme.index && theme.index.hitokoto)) unused.push('js/hitokoto.js');
  if (!(theme.comment && theme.comment.enable)) unused.push('js/waline.mjs');

  unused.forEach(function (route) {
    hexo.route.remove(route);
  });
});
