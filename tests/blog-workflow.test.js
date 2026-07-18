'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const syncScript = path.join(repoRoot, 'tools', 'sync-obsidian-blogs.js');
const doctorScript = path.join(repoRoot, 'tools', 'blog-doctor.js');
const { collectSubsetText } = require('../tools/font-subsets');

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
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html><body>Home</body></html>');
  fs.writeFileSync(path.join(publicDir, 'posts', 'example', 'index.html'), '<html><body>Example</body></html>');
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
