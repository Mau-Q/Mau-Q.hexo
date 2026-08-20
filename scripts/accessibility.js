/**
 * Hexo's generated heading permalink is intentionally empty visually, but its
 * title attribute duplicates the heading name for assistive technology. Keep
 * the permalink available to pointer users while removing that duplicate name
 * and keyboard stop.
 */
'use strict';

hexo.extend.filter.register('after_render:html', function (html) {
  return html.replace(
    /<a\b([^>]*\bclass=["'][^"']*\bheaderlink\b[^"']*["'][^>]*)><\/a>/g,
    function (match, attributes) {
      if (/\baria-hidden=/.test(attributes)) return match;
      return `<a${attributes} aria-hidden="true" tabindex="-1"></a>`;
    }
  );
});
