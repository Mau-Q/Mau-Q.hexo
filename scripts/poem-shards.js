/**
 * Poem shards: split source/data/poems.json (1,000 poems) into small shards
 * at build time so the homepage only fetches ~1/10 of the data per visit.
 *
 * Output routes: data/poems/0.json ... data/poems/<SHARD_COUNT - 1>.json
 * The original data/poems.json route is removed from the build output.
 *
 * SHARD_COUNT must stay in sync with source/js/randomPoem.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SHARD_COUNT = 10;
const SOURCE_FILE = path.join(hexo.source_dir, 'data', 'poems.json');

hexo.extend.generator.register('poem-shards', function () {
  if (!fs.existsSync(SOURCE_FILE)) {
    hexo.log.warn('poem-shards: %s not found, skip', SOURCE_FILE);
    return [];
  }

  const data = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  const poems = Array.isArray(data.poems) ? data.poems : [];
  if (poems.length === 0) return [];

  const shards = Array.from({ length: SHARD_COUNT }, () => []);
  poems.forEach(function (poem, index) {
    shards[index % SHARD_COUNT].push(poem);
  });

  return shards.map(function (shard, index) {
    return {
      path: 'data/poems/' + index + '.json',
      data: JSON.stringify({
        version: data.version || 1,
        count: shard.length,
        poems: shard,
      }),
    };
  });
});

hexo.extend.filter.register('after_generate', function () {
  hexo.route.remove('data/poems.json');
});
