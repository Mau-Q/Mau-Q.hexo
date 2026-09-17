'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '..');
const syncScript = path.join(repoRoot, 'tools', 'sync-obsidian-blogs.js');
const doctorScript = path.join(repoRoot, 'tools', 'blog-doctor.js');
const { collectSubsetText } = require('../tools/font-subsets');
const { buildOgImages, plainText, safeOgKey, wrapText } = require('../tools/og-images');
const { buildSeasonalPoemPayload, buildSolarTermCalendar } = require('../tools/seasonal-poems');
const { createAfterwordRenderer, loadAfterwordConfig, renderAfterword, selectAfterword } = require('../tools/post-afterword');

test('sync removes stale generated posts and assets when a note is unpublished', () => {
  const fixture = makeFixture();
  const noteFile = path.join(fixture.blogsDir, 'sample.md');
  const imageFile = path.join(fixture.blogsDir, 'photo.png');

  fs.writeFileSync(imageFile, 'fixture-image');
  fs.writeFileSync(noteFile, readyNote(), 'utf8');

  const first = runNode(syncScript, [], fixture.root);
  assert.equal(first.status, 0, first.stderr);

  const generatedPost = path.join(fixture.root, 'source', '_posts', 'sample-post.md');
  const generatedAssetDir = path.join(fixture.root, 'source', 'img', 'blogs', 'sample-post');
  assert.equal(fs.existsSync(generatedPost), true);
  assert.equal(fs.readdirSync(generatedAssetDir).length, 1);

  fs.writeFileSync(noteFile, readyNote().replace('status: ready', 'status: draft'), 'utf8');

  const dryRun = runNode(syncScript, ['--dry-run'], fixture.root);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Would remove stale generated file/);
  assert.equal(fs.existsSync(generatedPost), true, 'dry-run must not remove the post');

  const second = runNode(syncScript, [], fixture.root);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.existsSync(generatedPost), false);
  assert.equal(fs.existsSync(generatedAssetDir), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(fixture.root, 'obsidian-blog.manifest.json'), 'utf8'));
  assert.deepEqual(manifest.posts, []);
  assert.deepEqual(manifest.assets, []);
});

test('doctor derives post outputs and rejects missing local sitemap targets', () => {
  const fixture = makeFixture();
  const postDir = path.join(fixture.root, 'source', '_posts');
  const publicDir = path.join(fixture.root, 'public');

  fs.mkdirSync(path.join(publicDir, 'posts', 'example'), { recursive: true });
  fs.writeFileSync(path.join(postDir, 'example.md'), '---\ntitle: Example\n---\n\nSafe content.\n');
  fs.mkdirSync(path.join(publicDir, 'search'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'pagefind'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'img', 'og'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html><body>Home</body></html>');
  fs.writeFileSync(
    path.join(publicDir, 'posts', 'example', 'index.html'),
    '<html><head><meta property="og:image" content="/img/og/posts--example.png"></head><body><main data-pagefind-body>Example</main></body></html>'
  );
  fs.writeFileSync(path.join(publicDir, 'search', 'index.html'), '<html><body><pagefind-input></pagefind-input></body></html>');
  fs.writeFileSync(path.join(publicDir, 'pagefind', 'pagefind.js'), '');
  fs.writeFileSync(path.join(publicDir, 'pagefind', 'pagefind-component-ui.js'), '');
  fs.writeFileSync(path.join(publicDir, 'pagefind', 'pagefind-component-ui.css'), '');
  fs.writeFileSync(path.join(publicDir, 'pagefind', 'pagefind-highlight.js'), '');
  fs.writeFileSync(path.join(publicDir, 'img', 'og', 'site.png'), 'fixture');
  fs.writeFileSync(path.join(publicDir, 'img', 'og', 'posts--example.png'), 'fixture');
  fs.writeFileSync(path.join(publicDir, 'atom.xml'), '<feed></feed>');
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(
    path.join(publicDir, 'sitemap.xml'),
    '<urlset><url><loc>https://example.test/</loc></url><url><loc>https://example.test/missing.json</loc></url></urlset>'
  );

  const failed = runNode(doctorScript, [], fixture.root);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /target does not exist.*missing\.json/);

  fs.writeFileSync(
    path.join(publicDir, 'sitemap.xml'),
    '<urlset><url><loc>https://example.test/</loc></url><url><loc>https://example.test/posts/example/</loc></url></urlset>'
  );
  const passed = runNode(doctorScript, [], fixture.root);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Doctor passed/);

  const page = path.join(publicDir, 'posts', 'example', 'index.html');
  fs.appendFileSync(page, '<pre>tensor([[2.0]])</pre><code>[[3.0]]</code>');
  fs.writeFileSync(path.join(fixture.blogsDir, 'valid.md'), readyNote());
  assert.equal(runNode(doctorScript, [], fixture.root).status, 0, 'vault embeds and code arrays are valid');
  fs.appendFileSync(page, '<p>[[Unconverted note]]</p>');
  assert.match(runNode(doctorScript, [], fixture.root).stderr, /unresolved Obsidian wikilink/);
});

test('sync preserves Chinese heading links and distinguishes token terminology from credentials', () => {
  const fixture = makeFixture();
  const note = path.join(fixture.blogsDir, 'sample.md');
  fs.writeFileSync(note, readyNote().replace('![[photo.png]]', '[[sample#模型能表示，不等于训练能找到|说明]]\ntoken（词元，即输入单元）'));
  const result = runNode(syncScript, [], fixture.root);
  assert.equal(result.status, 0, result.stderr);
  const output = fs.readFileSync(path.join(fixture.root, 'source/_posts/sample-post.md'), 'utf8');
  assert.ok(output.includes('/posts/sample-post/#' + encodeURIComponent('模型能表示，不等于训练能找到')));
  fs.appendFileSync(note, '\napi_token: example-value\n');
  assert.notEqual(runNode(syncScript, ['--dry-run'], fixture.root).status, 0);
});

test('math renders subscripts and matrix rows while leaving code literals intact', () => {
  const { Marked } = require('marked');
  const markedKatex = require('marked-katex-extension');
  const parser = new Marked(markedKatex({ nonStandard: true, throwOnError: true }));
  const html = parser.parse('梯度$x_i$。\n\n$$\n\\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}\n$$\n\n`$x_i$`');
  assert.equal((html.match(/class="katex"/g) || []).length, 2);
  assert.match(html, /<code>\$x_i\$<\/code>/);
  assert.doesNotMatch(html, /katex-error/);
});

test('font subset corpus includes publishable pages and poetry resources', () => {
  const fixture = makeFixture();
  fs.mkdirSync(path.join(fixture.root, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(fixture.root, 'source', 'about.md'), '风格保留');
  fs.writeFileSync(path.join(fixture.root, 'resources', 'poems.json'), '{"text":"龘诗"}');

  const text = collectSubsetText(fixture.root);
  assert.match(text, /风格保留/);
  assert.match(text, /龘诗/);
});

test('OG image builder renders deterministic Chinese PNG cards', async () => {
  const fixture = makeFixture();
  const result = await buildOgImages({
    projectRoot: repoRoot,
    outputDir: path.join(fixture.root, 'og'),
    site: {
      title: 'Mau-Q',
      subtitle: '学习 · 记录 · 成长',
      description: '计算机学习与项目复盘。',
      url: 'https://mau-q.github.io'
    },
    posts: [{
      title: '数据库恢复中的 UNDO、REDO 与检查点',
      path: 'posts/database-recovery/index.html',
      date: new Date('2026-08-20T12:00:00+08:00'),
      categories: [{ name: '技术' }],
      content: '这是一段用于分享卡片的中文摘要。'
    }]
  });

  assert.equal(safeOgKey('posts/database-recovery/index.html'), 'posts--database-recovery');
  assert.equal(plainText('合适 > 优秀与 client-server'), '合适 > 优秀与 client-server');
  assert.equal(result.cards.length, 2);
  assert.deepEqual(wrapText('这是一个足够长的中文标题呀', 6, 2), ['这是一个足够', '长的中文标…']);
  const metadata = await sharp(result.cards[1].outputFile).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.equal(metadata.format, 'png');
});

test('solar-term calendar matches the official 2026 term dates', () => {
  const calendar = buildSolarTermCalendar(2026, 2026);
  assert.deepEqual(calendar['2026'], [
    '01-05', '01-20', '02-04', '02-18', '03-05', '03-20',
    '04-05', '04-20', '05-05', '05-21', '06-05', '06-21',
    '07-07', '07-23', '08-07', '08-23', '09-07', '09-23',
    '10-08', '10-23', '11-07', '11-22', '12-07', '12-22'
  ]);

  const payload = buildSeasonalPoemPayload({ projectRoot: repoRoot, startYear: 2026, endYear: 2026 });
  assert.equal(payload.poems.length, 24);
  assert.equal(payload.poems[13].term, '大暑');
  assert.equal(payload.years['2026'][13], '07-23');
});

test('post afterword follows categories and supports explicit opt-out', () => {
  const config = loadAfterwordConfig(repoRoot);
  const data = {
    title: '数据结构复习',
    path: 'posts/data-structures/',
    categories: ['学习'],
    tags: ['算法']
  };
  const first = selectAfterword(data, config);
  const second = selectAfterword(data, config);

  assert.deepEqual(first, second, 'the same post should keep the same afterword');
  assert.ok(config.rules[1].poems.some(poem => poem.text === first.text));
  assert.equal(selectAfterword({ ...data, afterword: false }, config), null);
  assert.match(renderAfterword({ text: '<诗句>', author: '作者', title: '篇名' }), /&lt;诗句&gt;/);
});

test('afterword catalog has 70 unique attributed entries', () => {
  const config = loadAfterwordConfig(repoRoot);
  assert.deepEqual(config.rules.map(rule => rule.poems.length), [15, 15, 15, 15]);
  assert.equal(config.default.length, 10);
  const poems = [...config.rules.flatMap(rule => rule.poems), ...config.default];
  assert.equal(new Set(poems.map(poem => poem.text)).size, 70);
  for (const poem of poems) {
    assert.ok(poem.text.trim());
    assert.ok(poem.title.trim(), 'each quotation names its source');
  }
});

test('cached afterwords preserve selection, escaping and metadata edits', () => {
  const config = loadAfterwordConfig(repoRoot);
  const render = createAfterwordRenderer(config);
  const data = { path: 'posts/cache-check/', title: '学习' };
  const check = () => assert.equal(render(data), renderAfterword(selectAfterword(data, config)));
  check();
  check(); // warm cache
  data.title = '生活';
  check(); // same path, different category
  for (const poem of config.rules[3].poems) poem.text += ' <修订>';
  check(); // catalog edit invalidates the cached HTML
  assert.match(render(data), /&lt;修订&gt;/);
  data.afterword = { text: '<自定义>', author: '甲&乙', title: '篇名' };
  check();
  data.afterword.text = '已修改';
  check();
  data.afterword = '<字符串>';
  check();
  data.afterword = false;
  assert.equal(render(data), '');
  delete data.afterword;
  data.title = '未匹配';
  check();
});

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mau-q-blog-'));
  const vaultDir = path.join(root, 'vault');
  const blogsDir = path.join(vaultDir, 'Blogs');

  fs.mkdirSync(path.join(root, 'source', '_posts'), { recursive: true });
  fs.mkdirSync(blogsDir, { recursive: true });
  fs.writeFileSync(path.join(root, '_config.yml'), 'url: https://example.test\n');
  fs.writeFileSync(
    path.join(root, 'obsidian-blog.config.json'),
    `${JSON.stringify({
      vaultDir,
      blogsDir: 'Blogs',
      postsDir: 'source/_posts',
      assetsDir: 'source/img/blogs',
      manifestFile: 'obsidian-blog.manifest.json',
      defaultCategory: '技术'
    }, null, 2)}\n`
  );

  return { root, vaultDir, blogsDir };
}

function readyNote() {
  return [
    '---',
    'title: Sample',
    'slug: sample-post',
    'date: 2026-07-18 12:00:00',
    'blog: true',
    'status: ready',
    'categories:',
    '  - 技术',
    '---',
    '',
    '正文',
    '',
    '![[photo.png]]',
    ''
  ].join('\n');
}

function runNode(script, args, root) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, BLOG_PROJECT_ROOT: root },
    encoding: 'utf8'
  });
}
