'use strict';

const { parseDocument, DomUtils } = require('htmlparser2');
const { escapeHTML } = require('hexo-util');

// Keep existing fragment IDs, but use one textual representation of each formula.
// This copy is only for the TOC; the rendered article and its math stay intact.
function outlineHeadings(html) {
  const document = parseDocument(html);
  function text(node) {
    const classes = (node.attribs?.class || '').split(/\s+/);
    if (classes.includes('headerlink')) return '';
    if (classes.includes('katex')) {
      const source = DomUtils.findOne(
        child => child.name === 'annotation' && child.attribs?.encoding === 'application/x-tex',
        node.children || [], true
      );
      if (source) return DomUtils.textContent(source);
    }
    if (node.type === 'text') return node.data;
    return (node.children || []).map(text).join('');
  }
  return DomUtils.findAll(node => /^h[1-6]$/.test(node.name || ''), document.children)
    .map(node => `<${node.name} id="${escapeHTML(node.attribs.id || '')}">${escapeHTML(text(node))}</${node.name}>`)
    .join('\n');
}

module.exports = { outlineHeadings };
