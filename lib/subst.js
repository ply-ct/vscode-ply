'use strict';

function get(path, obj, fb) {
  if (!fb)
    fb = `$\{${path}}`;
  return path.split('.').reduce((res, key) => res[key] || fb, obj);
}

module.exports = {
  // replaces template expressions with values
  replace: function(template, map, fallback) {
    if (!map)
      return template;
    return template.replace(/\$\{.+?}/g, (match) => {
      const path = match.substr(2, match.length - 3).trim();
      return get(path, map, fallback);
    });
  },
  // adds pre to the beginning of each line in str (except trailing newline)
  prefix: function(str, pre) {
    return str.split(/\n/).reduce((a, seg, i, arr) => {
      return i == arr.length - 1 && seg.length == 0 ? a : a + pre + seg + '\n';
    }, '');
  }
} 