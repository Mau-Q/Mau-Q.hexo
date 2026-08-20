/**
 * Theme patch: override A4 theme layout templates with local versions.
 * Local templates are stored in layout-overrides/ (mirrors theme's layout/ structure).
 * This survives npm install because the overrides are in project source, not node_modules.
 *
 * Patches applied:
 *  - head.ejs:     remove CDN Chinese font CSS link (use local @font-face instead)
 *  - font.ejs:     render a valid local Chinese font stack
 *  - layout.ejs:   use local /js/darkreader.min.js instead of jsdelivr CDN
 *  - header views: add semantic navigation and an accessible homepage hierarchy
 *  - index/list:   render scannable homepage and archive cards
 *  - footer.ejs:   use native JS, local poetry shards and conditional galleries
 *  - post.ejs:     render semantic titles, Pagefind content and article afterwords
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OVERRIDES_DIR = path.join(__dirname, '..', 'layout-overrides');

const OVERRIDES = [
  'layout.ejs',
  'index.ejs',
  'list.ejs',
  '_partial/head.ejs',
  '_partial/header.ejs',
  '_partial/post-header.ejs',
  '_partial/footer.ejs',
  '_partial/configcss/font.ejs',
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

  const themePostFile = path.join(hexo.theme_dir, 'layout', 'post.ejs');
  let postContent = fs.readFileSync(themePostFile, 'utf8');
  const leftTitle = [
    '                <div class="post-main-title">',
    '                    <%= page.title %>',
    '                </div>'
  ].join('\n');
  const centeredTitle = [
    '                <div class="post-main-title" style="text-align: center;">',
    '                    <%= page.title %>',
    '                </div>'
  ].join('\n');
  const leftTitleCount = postContent.split(leftTitle).length - 1;
  const centeredTitleCount = postContent.split(centeredTitle).length - 1;
  if (leftTitleCount !== 2 || centeredTitleCount !== 2) {
    throw new Error(
      `theme-patch: unexpected post title template shape in ${themePostFile} ` +
      `(left=${leftTitleCount}, centered=${centeredTitleCount})`
    );
  }
  postContent = postContent
    .split(leftTitle)
    .join(leftTitle.replace('<div ', '<h1 ').replace('</div>', '</h1>'))
    .split(centeredTitle)
    .join(centeredTitle.replace('<div ', '<h1 ').replace('</div>', '</h1>'));

  const postBodyMarker = '    <div class="post-md">';
  if (!postContent.includes(postBodyMarker)) {
    throw new Error(`theme-patch: unable to find post body marker in ${themePostFile}`);
  }
  postContent = postContent.replace(
    postBodyMarker,
    '    <div class="post-md"<% if(is_post()) { %> data-pagefind-body<% } %>>'
  );

  const contentMarker = '        <%- page.content %>';
  if (!postContent.includes(contentMarker)) {
    throw new Error(`theme-patch: unable to find post content marker in ${themePostFile}`);
  }
  const patchedPost = postContent.replace(
    contentMarker,
    `${contentMarker}\n        <% if(is_post()) { %><%- post_afterword(page) %><% } %>`
  );
  hexo.theme.setView('post.ejs', patchedPost);
  hexo.log.info('theme-patch: augmented post.ejs with article afterwords');
});

// Drop theme assets that this site does not use. This keeps both the deployed
// repository and the generated-site audit surface small.
hexo.extend.filter.register('after_generate', function () {
  const theme = hexo.theme.config || {};
  const unused = [
    'js/darkmode-js.min.js',
    'js/randomHeaderContent.js',
    'css/a11y-dark.min.css',
    'data/poems.json',
    'index/index.html',
    'img/market.png',
    'img/archive.png',
    'img/comment.png',
    'img/index.png',
    'img/tags&&categories.png',
    'img/A4-favicon.png',
    'img/A4800x500.png',
    'img/favicon.ico',
    'img/favicon.png'
  ];

  if (!(theme.index && theme.index.hitokoto)) unused.push('js/hitokoto.js');
  if (!(theme.comment && theme.comment.enable)) {
    unused.push('js/waline.mjs', 'css/waline.css');
  }

  const contentItems = []
    .concat(hexo.locals.get('posts').toArray(), hexo.locals.get('pages').toArray());
  const hasGallery = contentItems.some(item => /gallery-item/.test(String(item.content || '')));
  if (!hasGallery) {
    unused.push(
      'css/lightgallery-bundle.min.css',
      'images/loading.gif',
      'fonts/lg.svg',
      'fonts/lg.ttf',
      'fonts/lg.woff',
      'fonts/lg.woff2',
      'js/lightgallery/lightgallery.umd.min.js',
      'js/lightgallery/plugins/lg-thumbnail.umd.min.js',
      'js/lightgallery/plugins/lg-fullscreen.umd.min.js',
      'js/lightgallery/plugins/lg-autoplay.umd.min.js',
      'js/lightgallery/plugins/lg-zoom.umd.min.js',
      'js/lightgallery/plugins/lg-rotate.umd.min.js',
      'js/lightgallery/plugins/lg-paper.umd.min.js'
    );
  }

  unused.forEach(function (route) {
    hexo.route.remove(route);
  });
});
