#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const projectRoot = path.resolve(process.env.BLOG_PROJECT_ROOT || path.resolve(__dirname, '..'));
const configPath = path.join(projectRoot, 'obsidian-blog.config.json');
const slugDictionaryPath = path.join(projectRoot, 'blog-slug-dictionary.json');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || args.has('--check');
const slugCheck = args.has('--slug-check');
const slugFix = args.has('--slug-fix');
const strict = !args.has('--no-strict');

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.mp3', '.ogg', '.wav', '.mp4', '.mov', '.pdf']);
const SMART_SLUG_REPLACEMENTS = loadSlugReplacements();
const PUBLISHING_RISK_PATTERNS = [
  ['TODO', /\bTODO\b/i],
  ['FIXME', /\bFIXME\b/i],
  ['unfinished draft marker', /待补|待完善|未完成|草稿/],
  ['password or secret', /密码|password|passwd|secret|token/i],
  ['account', /账号|账户|account/i],
  ['id card', /身份证/],
  ['phone number', /手机号|电话[:：]?\s*1[3-9]\d{9}|(^|[^\d])1[3-9]\d{9}([^\d]|$)/],
  ['localhost', /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i],
  ['local file path', /(file:\/\/|\/Users\/rui\/)/]
];

const config = readConfig();
const vaultDir = process.env.OBSIDIAN_VAULT || resolveFrom(projectRoot, config.vaultDir || '../../rui');
const blogsDir = process.env.OBSIDIAN_BLOGS_DIR || resolveFrom(vaultDir, config.blogsDir || 'Blogs');
const postsDir = resolveFrom(projectRoot, config.postsDir || 'source/_posts');
const assetsDir = resolveFrom(projectRoot, config.assetsDir || 'source/img/blogs');
const manifestPath = resolveFrom(projectRoot, config.manifestFile || 'obsidian-blog.manifest.json');
const defaultCategory = config.defaultCategory || '技术';
const publicAssetsRoot = toPosix(path.relative(path.join(projectRoot, 'source'), assetsDir));

const errors = [];
const warnings = [];
const copiedAssets = new Map();
const generatedAssetFiles = new Set();
let assetIndex = null;

main();

function main() {
  if (!fs.existsSync(blogsDir)) {
    fail(`Obsidian Blogs folder does not exist: ${blogsDir}`);
  }
  if (slugCheck && slugFix) {
    fail('Use either --slug-check or --slug-fix, not both.');
  }

  const allNotes = walkFiles(blogsDir).filter(file => file.endsWith('.md') && !path.basename(file).startsWith('_'));
  const candidates = allNotes.map(loadNote).filter(Boolean);
  if (slugCheck || slugFix) {
    runSlugMode(candidates, slugFix);
    return;
  }

  const readyNotes = candidates.filter(note => note.data.blog === true && String(note.data.status || '').toLowerCase() === 'ready');
  for (const note of readyNotes) scanPublishingRisks(note);
  if (errors.length && strict) {
    printErrorsAndExit();
  }

  const publishedMap = buildPublishedMap(readyNotes);
  const results = readyNotes.map(note => syncNote(note, publishedMap));

  if (warnings.length) {
    console.warn(`Warnings (${warnings.length}):`);
    for (const warning of warnings) console.warn(`- ${warning}`);
  }

  if (errors.length && strict) {
    printErrorsAndExit();
  }

  finalizeGeneratedContent(results.filter(Boolean));

  if (!readyNotes.length) {
    console.log(`No ready Obsidian blog posts found in ${blogsDir}`);
    console.log('Set blog: true and status: ready in a note front matter to publish it.');
    return;
  }

  for (const result of results) {
    if (result) console.log(`${dryRun ? 'Would sync' : 'Synced'} ${result.source} -> ${result.target}`);
  }
}

function readConfig() {
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function loadSlugReplacements() {
  if (!fs.existsSync(slugDictionaryPath)) return [];
  const raw = JSON.parse(fs.readFileSync(slugDictionaryPath, 'utf8'));
  const entries = Array.isArray(raw) ? raw : Object.entries(raw);
  return entries
    .filter(entry => Array.isArray(entry) && entry.length >= 2)
    .map(([source, target]) => [String(source), String(target)]);
}

function resolveFrom(base, value) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printErrorsAndExit() {
  console.error(`Errors (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

function walkFiles(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'node_modules') continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function loadNote(file) {
  const rel = toPosix(path.relative(blogsDir, file));
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const parsed = parseFrontMatter(raw);
    return { file, rel, raw, data: parsed.data, body: parsed.body };
  } catch (error) {
    errors.push(`${rel}: invalid front matter: ${error.message}`);
    return null;
  }
}

function runSlugMode(notes, writeChanges) {
  const blogNotes = notes.filter(note => note.data.blog === true);
  if (!blogNotes.length) {
    console.log(`No Obsidian blog notes found in ${blogsDir}`);
    console.log('Set blog: true in a note front matter before generating slugs.');
    return;
  }

  const usedSlugs = new Map();
  const plans = blogNotes.map(note => {
    const currentSlug = String(note.data.slug || '').trim();
    const generatedSlug = makeUniqueSlug(getSlug(note), note, usedSlugs);
    const normalizedCurrent = currentSlug ? sanitizeSlug(currentSlug) : '';
    const needsWrite = !currentSlug || normalizedCurrent !== generatedSlug || currentSlug !== generatedSlug;
    return { note, currentSlug, generatedSlug, needsWrite };
  });

  for (const plan of plans) {
    const prefix = plan.needsWrite ? (writeChanges ? 'Set' : 'Would set') : 'OK';
    const before = plan.currentSlug || '(missing)';
    const arrow = plan.needsWrite ? `${before} -> ${plan.generatedSlug}` : plan.generatedSlug;
    console.log(`${prefix} ${plan.note.rel}: ${arrow}`);

    if (writeChanges && plan.needsWrite) {
      const updated = upsertSlugInFrontMatter(plan.note.raw, plan.generatedSlug);
      fs.writeFileSync(plan.note.file, updated, 'utf8');
    }
  }

  if (!plans.some(plan => plan.needsWrite)) {
    console.log('All Obsidian blog slugs are already fixed.');
  } else if (!writeChanges) {
    console.log('Run npm run blog:slug:fix to write these slugs back to Obsidian.');
  }

  if (warnings.length) {
    console.warn(`Warnings (${warnings.length}):`);
    for (const warning of warnings) console.warn(`- ${warning}`);
  }
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { data: {}, body: raw };
  const data = yaml.load(match[1]) || {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('front matter must be a YAML object');
  }
  return { data, body: raw.slice(match[0].length) };
}

function buildPublishedMap(notes) {
  const map = new Map();
  const slugs = new Map();

  for (const note of notes) {
    const slug = getSlug(note);
    if (!slug) continue;
    if (slugs.has(slug)) {
      errors.push(`${note.rel}: duplicate slug "${slug}" also used by ${slugs.get(slug)}`);
    }
    slugs.set(slug, note.rel);

    const relNoExt = stripMdExtension(toPosix(note.rel));
    const base = path.basename(relNoExt);
    map.set(relNoExt, slug);
    map.set(base, slug);
    if (note.data.title) map.set(String(note.data.title), slug);
  }

  return map;
}

function syncNote(note, publishedMap) {
  const slug = getSlug(note);
  if (!slug) return null;

  const title = String(note.data.title || stripMdExtension(path.basename(note.file))).trim();
  const date = formatDateValue(note.data.date, fs.statSync(note.file).mtime);
  const categories = normalizeList(note.data.categories || note.data.category, [defaultCategory]);
  const tags = normalizeList(note.data.tags, []);
  const errorCountBeforeTransform = errors.length;
  const body = transformBody(note, slug, publishedMap);
  if (strict && errors.length > errorCountBeforeTransform) return null;

  const updated = formatDateValue(note.data.updated, fs.statSync(note.file).mtime);
  const frontMatter = { title, date, updated, categories, tags };

  const output = dumpFrontMatter(frontMatter, [
    `<!-- Generated from Obsidian: ${toPosix(path.relative(vaultDir, note.file))}. Edit the source note, then run npm run blog:sync. -->`,
    '',
    body.trimStart()
  ].join('\n'));

  const targetFile = path.join(postsDir, `${slug}.md`);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, output, 'utf8');
  }

  return {
    source: toPosix(path.relative(vaultDir, note.file)),
    target: toPosix(path.relative(projectRoot, targetFile)),
    targetFile
  };
}

function finalizeGeneratedContent(results) {
  const expectedPosts = new Set(results.map(result => result.target));
  const expectedAssets = new Set(generatedAssetFiles);
  const previous = readManifest();
  const stalePostFiles = new Set();

  for (const rel of previous.posts || []) {
    if (!expectedPosts.has(rel)) stalePostFiles.add(resolveManifestFile(rel, postsDir));
  }

  for (const file of discoverGeneratedPosts()) {
    const rel = toPosix(path.relative(projectRoot, file));
    if (!expectedPosts.has(rel)) stalePostFiles.add(file);
  }

  const staleAssetFiles = new Set();
  for (const rel of previous.assets || []) {
    if (!expectedAssets.has(rel)) staleAssetFiles.add(resolveManifestFile(rel, assetsDir));
  }

  // Backward-compatible cleanup for files produced before the manifest existed:
  // a generated post named <slug>.md owns source/img/blogs/<slug>/.
  for (const postFile of stalePostFiles) {
    const slug = path.basename(postFile, path.extname(postFile));
    const assetDir = path.join(assetsDir, slug);
    if (fs.existsSync(assetDir)) {
      for (const file of walkFiles(assetDir)) staleAssetFiles.add(file);
    }
  }

  for (const file of [...stalePostFiles].sort()) {
    removeGeneratedFile(file, postsDir);
  }
  for (const file of [...staleAssetFiles].sort()) {
    removeGeneratedFile(file, assetsDir);
  }

  if (!dryRun) {
    removeEmptyDirectories(assetsDir);
    const manifest = {
      version: 1,
      posts: [...expectedPosts].sort(),
      assets: [...expectedAssets].sort()
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}

function discoverGeneratedPosts() {
  if (!fs.existsSync(postsDir)) return [];
  return walkFiles(postsDir).filter(file => {
    if (!file.endsWith('.md')) return false;
    return fs.readFileSync(file, 'utf8').includes('<!-- Generated from Obsidian:');
  });
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) return { version: 1, posts: [], assets: [] };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
      version: manifest.version || 1,
      posts: Array.isArray(manifest.posts) ? manifest.posts : [],
      assets: Array.isArray(manifest.assets) ? manifest.assets : []
    };
  } catch (error) {
    errors.push(`${toPosix(path.relative(projectRoot, manifestPath))}: invalid manifest: ${error.message}`);
    if (strict) printErrorsAndExit();
    return { version: 1, posts: [], assets: [] };
  }
}

function resolveManifestFile(relativePath, allowedRoot) {
  const fullPath = path.resolve(projectRoot, relativePath);
  assertInside(fullPath, allowedRoot);
  return fullPath;
}

function removeGeneratedFile(file, allowedRoot) {
  assertInside(file, allowedRoot);
  if (!fs.existsSync(file)) return;
  const rel = toPosix(path.relative(projectRoot, file));
  console.log(`${dryRun ? 'Would remove' : 'Removed'} stale generated file ${rel}`);
  if (!dryRun) fs.unlinkSync(file);
}

function removeEmptyDirectories(root) {
  if (!fs.existsSync(root)) return;
  const directories = [];
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(directory, entry.name);
      collect(child);
      directories.push(child);
    }
  }
  collect(root);
  for (const directory of directories) {
    if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  }
}

function assertInside(file, allowedRoot) {
  const relative = path.relative(path.resolve(allowedRoot), path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify file outside ${allowedRoot}: ${file}`);
  }
}

function getSlug(note) {
  if (note.resolvedSlug) return note.resolvedSlug;

  const explicitSlug = String(note.data.slug || '').trim();
  const title = String(note.data.title || '').trim();
  const fileTitle = stripMdExtension(path.basename(note.file));
  const rawSlug = explicitSlug || fileTitle;
  const slug = sanitizeSlug(rawSlug);

  if (!explicitSlug) {
    const autoSlug = getAutoSlug(note, fileTitle, title);
    if (autoSlug) {
      note.resolvedSlug = autoSlug;
      return autoSlug;
    }
  }

  if (!slug || shouldUseFallbackSlug(rawSlug, slug, explicitSlug)) {
    const fallbackSlug = buildFallbackSlug(note);
    if (explicitSlug) {
      warnings.push(`${note.rel}: slug "${explicitSlug}" is not URL-safe enough; using "${fallbackSlug}"`);
    }
    note.resolvedSlug = fallbackSlug;
    return fallbackSlug;
  }

  if (explicitSlug && slug !== explicitSlug) {
    warnings.push(`${note.rel}: slug normalized from "${explicitSlug}" to "${slug}"`);
  }

  note.resolvedSlug = slug;
  return slug;
}

function makeUniqueSlug(slug, note, usedSlugs) {
  if (!usedSlugs.has(slug)) {
    usedSlugs.set(slug, note.rel);
    return slug;
  }

  let suffixLength = 6;
  let uniqueSlug = `${slug}-${shortNoteHash(note, suffixLength)}`;
  while (usedSlugs.has(uniqueSlug)) {
    suffixLength += 2;
    uniqueSlug = `${slug}-${shortNoteHash(note, suffixLength)}`;
  }

  warnings.push(`${note.rel}: slug "${slug}" duplicated with ${usedSlugs.get(slug)}; using "${uniqueSlug}"`);
  usedSlugs.set(uniqueSlug, note.rel);
  return uniqueSlug;
}

function sanitizeSlug(value) {
  return String(value)
    .replace(/c\+\+/gi, 'cpp')
    .replace(/c#/gi, 'csharp')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function shouldUseFallbackSlug(rawSlug, slug, explicitSlug) {
  if (explicitSlug) return false;
  return /[^\x00-\x7F]/.test(rawSlug) && slug.length < 8;
}

function getAutoSlug(note, fileTitle, title) {
  const titleSlug = buildSmartSlug(title);
  if (isUsefulAutoSlug(titleSlug)) return titleSlug;

  if (hasCjk(title) && isLifeNote(note)) {
    return buildDatedSlug('life', note);
  }

  const fileSlug = sanitizeSlug(fileTitle);
  if (isAsciiTitle(fileTitle) && isUsefulAutoSlug(fileSlug)) return fileSlug;

  const smartFileSlug = buildSmartSlug(fileTitle);
  if (isUsefulAutoSlug(smartFileSlug)) return smartFileSlug;

  if (isUsefulAutoSlug(fileSlug) && /[a-z]/.test(fileSlug)) return fileSlug;
  return '';
}

function buildSmartSlug(value) {
  let text = String(value || '').normalize('NFKC');
  text = text.replace(/c\+\+/gi, 'cpp').replace(/c#/gi, 'csharp');

  for (const [source, target] of SMART_SLUG_REPLACEMENTS) {
    text = text.split(source).join(` ${target} `);
  }

  return sanitizeSlug(text);
}

function isAsciiTitle(value) {
  return /^[\x00-\x7F]+$/.test(String(value || ''));
}

function isUsefulAutoSlug(slug) {
  return slug.length >= 4 && /[a-z0-9]/.test(slug);
}

function buildFallbackSlug(note) {
  return buildDatedSlug('post', note);
}

function buildDatedSlug(prefix, note) {
  const date = formatDateValue(note.data.date, fs.statSync(note.file).mtime).slice(0, 10).replace(/-/g, '');
  const hash = shortNoteHash(note, 6);
  return `${prefix}-${date || 'undated'}-${hash}`;
}

function hasCjk(value) {
  return /[\u3400-\u9FFF]/.test(String(value || ''));
}

function isLifeNote(note) {
  const categories = normalizeList(note.data.categories || note.data.category, []);
  return categories.includes('生活');
}

function shortNoteHash(note, length) {
  return crypto.createHash('sha1')
    .update(toPosix(path.relative(vaultDir, note.file)))
    .digest('hex')
    .slice(0, length);
}

function upsertSlugInFrontMatter(raw, slug) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    return ['---', `slug: ${slug}`, '---', '', raw].join(eol);
  }

  const frontMatter = match[1];
  const lines = frontMatter.split(/\r?\n/);
  const slugLineIndex = lines.findIndex(line => /^\s*slug\s*:/.test(line) || /^\s*#\s*slug\s*:/.test(line));

  if (slugLineIndex >= 0) {
    lines[slugLineIndex] = `slug: ${slug}`;
  } else {
    const titleLineIndex = lines.findIndex(line => /^\s*title\s*:/.test(line));
    const insertAt = titleLineIndex >= 0 ? titleLineIndex + 1 : lines.length;
    lines.splice(insertAt, 0, `slug: ${slug}`);
  }

  const replacement = `---${eol}${lines.join(eol)}${eol}---${eol}`;
  return replacement + raw.slice(match[0].length);
}

function scanPublishingRisks(note) {
  for (const [label, regex] of PUBLISHING_RISK_PATTERNS) {
    const match = findPatternOutsideCode(note.body, regex);
    if (match) {
      errors.push(`${note.rel}:${match.line}: publishing risk "${label}" found: ${match.text}`);
    }
  }
}

function findPatternOutsideCode(markdown, regex) {
  const lines = markdown.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    regex.lastIndex = 0;
    if (regex.test(line)) {
      return {
        line: i + 1,
        text: line.trim().slice(0, 100)
      };
    }
  }
  return null;
}

function normalizeList(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

function formatDateValue(value, fallback = new Date()) {
  if (value === undefined || value === null || value === '') return formatDate(fallback);
  if (value instanceof Date) return formatDate(value);
  return String(value).trim();
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dumpFrontMatter(data, body) {
  const dumped = yaml.dump(data, {
    lineWidth: 1000,
    noRefs: true,
    sortKeys: false
  }).trimEnd();
  return `---\n${dumped}\n---\n\n${body.trimStart()}\n`;
}

function transformBody(note, slug, publishedMap) {
  let body = note.body.replace(/%%[\s\S]*?%%/g, '');
  const lines = body.split('\n');
  let inFence = false;

  body = lines.map(line => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return transformLine(line, note, slug, publishedMap);
  }).join('\n');

  const outsideCode = getOutsideFenceText(body);
  if (/!\[\[[^\]]+\]\]/.test(outsideCode)) {
    errors.push(`${note.rel}: unresolved Obsidian embed remains`);
  }
  if (/\[\[[^\]]+\]\]/.test(outsideCode)) {
    errors.push(`${note.rel}: unresolved Obsidian wikilink remains`);
  }
  if (/!\[[^\]]*\]\(\s*https?:\/\//i.test(outsideCode)) {
    errors.push(`${note.rel}: remote markdown images are not allowed; store the image in the vault first`);
  }
  if (/(file:\/\/|\/Users\/rui\/)/.test(outsideCode)) {
    errors.push(`${note.rel}: local filesystem path remains in content`);
  }

  return body;
}

function transformLine(line, note, slug, publishedMap) {
  return line
    .replace(/^> \[!([a-zA-Z0-9_-]+)\][+-]?(?:[ \t]+(.+))?$/, (_, type, title) => `> **${title || type}**`)
    .replace(/!\[\[([^\]]+)\]\]/g, (_, inner) => transformEmbed(inner, note, slug))
    .replace(/!\[([^\]]+)\]\(([^)]+)\)/g, (_, alt, url) => {
      const cleanAlt = alt.split('|')[0].trim();
      return `![${cleanAlt}](${url})`;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_, inner) => transformWikiLink(inner, publishedMap));
}

function transformEmbed(inner, note, slug) {
  const parsed = parseEmbed(inner);
  const extension = path.extname(parsed.target).toLowerCase();

  if (!IMAGE_EXTENSIONS.has(extension)) {
    errors.push(`${note.rel}: unsupported embed "![[${inner}]]"; only image embeds are copied`);
    return `![[${inner}]]`;
  }

  const sourceFile = findAsset(parsed.target, note.file);
  if (!sourceFile) {
    errors.push(`${note.rel}: image not found for "![[${inner}]]"`);
    return `![[${inner}]]`;
  }

  const webPath = copyAsset(sourceFile, slug);
  const alt = path.basename(parsed.target, extension);
  const sizeAttrs = imageSizeAttributes(parsed.size);
  if (sizeAttrs) return `<img src="${webPath}" alt="${escapeHtml(alt)}" ${sizeAttrs}>`;
  return `![${alt}](${webPath})`;
}

function parseEmbed(inner) {
  const [targetPart, sizePart] = inner.split('|');
  return {
    target: cleanWikiTarget(targetPart),
    size: String(sizePart || '').trim()
  };
}

function cleanWikiTarget(target) {
  const withoutAnchor = String(target || '').split('#')[0].trim();
  try {
    return decodeURIComponent(withoutAnchor);
  } catch (_) {
    return withoutAnchor;
  }
}

function imageSizeAttributes(size) {
  if (!size) return '';
  if (/^\d+$/.test(size)) return `width="${size}"`;
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) return `width="${match[1]}" height="${match[2]}"`;
  return '';
}

function transformWikiLink(inner, publishedMap) {
  const parsed = parseWikiLink(inner);
  const linkedSlug = lookupPublishedSlug(parsed.target, publishedMap);
  if (linkedSlug) return `[${parsed.display}](/posts/${linkedSlug}/)`;
  return parsed.display;
}

function parseWikiLink(inner) {
  const [targetPart, ...aliasParts] = inner.split('|');
  const targetWithAnchor = String(targetPart || '').trim();
  const target = cleanWikiTarget(targetWithAnchor);
  const heading = targetWithAnchor.includes('#') ? targetWithAnchor.split('#').slice(1).join('#').trim() : '';
  const alias = aliasParts.join('|').trim();
  const display = alias || heading || path.basename(target || targetWithAnchor);
  return { target, display };
}

function lookupPublishedSlug(target, publishedMap) {
  if (!target) return null;
  const key = stripMdExtension(toPosix(target).replace(/^\/+/, ''));
  return publishedMap.get(key) || publishedMap.get(path.basename(key)) || null;
}

function findAsset(target, noteFile) {
  const localCandidate = path.resolve(path.dirname(noteFile), target);
  if (fs.existsSync(localCandidate)) return localCandidate;

  const vaultCandidate = path.resolve(vaultDir, target);
  if (fs.existsSync(vaultCandidate)) return vaultCandidate;

  const index = getAssetIndex();
  const matches = index.get(path.basename(target)) || [];
  if (matches.length > 1) {
    warnings.push(`Multiple assets named ${path.basename(target)}; using ${toPosix(path.relative(vaultDir, matches[0]))}`);
  }
  return matches[0] || null;
}

function getAssetIndex() {
  if (assetIndex) return assetIndex;
  assetIndex = new Map();
  for (const file of walkFiles(vaultDir)) {
    const extension = path.extname(file).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(extension)) continue;
    const base = path.basename(file);
    if (!assetIndex.has(base)) assetIndex.set(base, []);
    assetIndex.get(base).push(file);
  }
  return assetIndex;
}

function copyAsset(sourceFile, slug) {
  const cacheKey = `${slug}:${sourceFile}`;
  if (copiedAssets.has(cacheKey)) return copiedAssets.get(cacheKey);

  const fileName = safeAssetName(sourceFile);
  const targetDir = path.join(assetsDir, slug);
  const targetFile = path.join(targetDir, fileName);
  const webPath = `/${toPosix(path.join(publicAssetsRoot, slug, fileName))}`;

  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }

  generatedAssetFiles.add(toPosix(path.relative(projectRoot, targetFile)));
  copiedAssets.set(cacheKey, webPath);
  return webPath;
}

function safeAssetName(file) {
  const extension = path.extname(file).toLowerCase();
  const base = path.basename(file, extension)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  const hash = crypto.createHash('sha1').update(file).digest('hex').slice(0, 8);
  return `${base || 'asset'}-${hash}${extension}`;
}

function getOutsideFenceText(markdown) {
  const output = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) output.push(line);
  }
  return output.join('\n');
}

function stripMdExtension(value) {
  return value.replace(/\.md$/i, '');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
