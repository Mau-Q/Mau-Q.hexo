'use strict';

const { Renderer } = require('marked');
const { escapeHTML } = require('hexo-util');
const renderBlockquote = Renderer.prototype.blockquote;
const defaultTitles = { example: '示例', note: '笔记' };

hexo.extend.filter.register('marked:renderer', renderer => {
  renderer.blockquote = function (token) {
    const first = token.tokens && token.tokens[0];
    if (!first || first.type !== 'paragraph' || typeof first.text !== 'string') {
      return renderBlockquote.call(this, token);
    }

    const marker = /^\s*\[!([a-zA-Z0-9_-]+)\][+-]?(?:[ \t]+([^\r\n]*))?(?:\r?\n|$)/.exec(first.text);
    if (!marker) return renderBlockquote.call(this, token);

    const type = marker[1].toLowerCase();
    const title = (marker[2] || '').trim() || defaultTitles[type] || type;
    let body = '';
    const firstBodyLine = first.text.slice(marker[0].length);
    if (firstBodyLine) {
      const inlineTokens = (first.tokens || []).slice();
      const lead = inlineTokens[0];
      if (lead && lead.type === 'text' && lead.text.startsWith(marker[0])) {
        const remainingText = lead.text.slice(marker[0].length);
        if (remainingText) {
          inlineTokens[0] = { ...lead, raw: remainingText, text: remainingText };
        } else {
          inlineTokens.shift();
        }
        body = `<p>${this.parser.parseInline(inlineTokens)}</p>\n`;
      } else {
        body = `<p>${escapeHTML(firstBodyLine)}</p>\n`;
      }
    }
    body += this.parser.parse(token.tokens.slice(1));
    const label = escapeHTML(title);
    return `<aside class="post-callout post-callout-${type}" aria-label="${label}">\n` +
      `<p class="post-callout-title">${label}</p>\n${body}</aside>\n`;
  };
});
