/**
 * Theme patch: override A4 theme layout templates with local versions.
 * Local templates are stored in layout-overrides/ (mirrors theme's layout/ structure).
 * This survives npm install because the overrides are in project source, not node_modules.
 *
 * Patches applied:
 *  - head.ejs:     remove CDN Chinese font CSS link (use local @font-face instead)
 *  - layout.ejs:   use local /js/darkreader.min.js instead of jsdelivr CDN
 *  - footer.ejs:   use local /js/jquery-*.min.js instead of cdnjs CDN
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
