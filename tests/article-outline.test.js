'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const { outlineHeadings } = require('../tools/article-outline');

test('TOC extracts one formula label and preserves existing deep links', () => {
  const html = '<h3 id="existing-f-x-f-x-f-x"><a class="headerlink" href="#existing-f-x-f-x-f-x"></a>' +
    '第二步：用策略函数 ' + katex.renderToString('f(x)') + ' 改变分数</h3>';
  assert.equal(outlineHeadings(html),
    '<h3 id="existing-f-x-f-x-f-x">第二步：用策略函数 f(x) 改变分数</h3>');
});

test('TOC preserves heading order and safely escapes formatted labels', () => {
  assert.equal(outlineHeadings('<h2 id="a&amp;b"><em>A &amp; B</em></h2><p>Body</p><h3 id="child">x &lt; y</h3>'),
    '<h2 id="a&amp;b">A &amp; B</h2>\n<h3 id="child">x &lt; y</h3>');
});
