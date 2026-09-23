'use strict';

const { Renderer } = require('marked');
const { escapeHTML } = require('hexo-util');
const renderBlockquote = Renderer.prototype.blockquote;

hexo.extend.filter.register('marked:renderer', renderer => {
  renderer.blockquote = function (token) {
    const first = token.tokens && token.tokens[0];
    if (!first || first.type !== 'paragraph' || typeof first.text !== 'string') {
      return renderBlockquote.call(this, token);
    }

    const marker = /^\s*\[!example\]\s*(.*)$/i.exec(first.text);
    if (!marker) return renderBlockquote.call(this, token);

    const title = marker[1].trim() || '示例';
    const body = this.parser.parse(token.tokens.slice(1));
    const label = escapeHTML(title);
    return `<aside class="post-callout post-callout-example" aria-label="${label}">\n` +
      `<p class="post-callout-title">${label}</p>\n${body}</aside>\n`;
  };
});
