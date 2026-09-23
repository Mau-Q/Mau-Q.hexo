'use strict';

const { escapeHTML } = require('hexo-util');
const { Renderer } = require('marked');
const figureParagraph = Symbol('figureParagraph');
const scrollTable = Symbol('scrollTable');
const tableScrollWrapper =
  '<div class="table-scroll" role="region" tabindex="0" aria-label="可横向滚动的表格">';
const nestedScrollTables =
  /<div class="table-scroll" role="region" tabindex="0" aria-label="可横向滚动的表格">\s*<div class="table-scroll" role="region" tabindex="0" aria-label="可横向滚动的表格">\s*(<table\b[\s\S]*?<\/table>)\s*<\/div>\s*<\/div>/g;

hexo.extend.filter.register('marked:renderer', renderer => {
  const baseParagraph = renderer.paragraph || Renderer.prototype.paragraph;
  if (!baseParagraph[figureParagraph]) {
    const paragraph = function (token) {
      const children = token.tokens || [];
      if (children.length !== 1 || children[0].type !== 'image') {
        return baseParagraph.call(this, token);
      }

      const image = children[0];
      const imageMarkup = this.parser.parseInline([
        image.title ? { ...image, title: null } : image
      ]);
      const caption = image.title
        ? '<figcaption>' + escapeHTML(image.title) + '</figcaption>'
        : '';

      return '<figure class="post-figure">\n' + imageMarkup +
        '\n' + caption + '</figure>\n';
    };
    paragraph[figureParagraph] = true;
    renderer.paragraph = paragraph;
  }

  const baseTable = renderer.table || Renderer.prototype.table;
  if (!baseTable[scrollTable]) {
    const table = function (token) {
      const tableMarkup = baseTable.call(this, token);
      if (tableMarkup.includes('class="table-scroll"')) return tableMarkup;
      return '<div class="table-scroll" role="region" tabindex="0" ' +
        'aria-label="可横向滚动的表格">\n' +
        tableMarkup + '</div>\n';
    };
    table[scrollTable] = true;
    renderer.table = table;
  }
});

hexo.extend.filter.register('after_render:html', html => {
  let output = html;
  let previous;
  do {
    previous = output;
    output = output.replace(
      nestedScrollTables,
      tableScrollWrapper + '\n$1\n</div>\n'
    );
  } while (output !== previous);
  return output;
});
