'use strict';

function get(path, obj, fb) {
  if (!fb)
    fb = `$\{${path}}`;
  return path.split('.').reduce((res, key) => res[key] || fb, obj);
}

module.exports = {
  // Replaces template expressions with values.
  replace: function(template, map, fallback) {
    if (!map)
      return template;
    return template.replace(/\$\{.+?}/g, (match) => {
      const path = match.substr(2, match.length - 3).trim();
      return get(path, map, fallback);
    });
  },
  // Adds pre to the beginning of each line in str (except trailing newline).
  // Optional codeLines, start to restore comments.
  prefix: function(str, pre, codeLines, start) {
    return str.split(/\n/).reduce((a, seg, i, arr) => {
      var line = i == arr.length - 1 && seg.length == 0 ? '' : pre + seg;
      if (line) {
        if (codeLines) {
          var codeLine = codeLines[start + i];
          if (codeLine.comment)
            line += codeLine.comment;
        }
        line += '\n';
      }
      return a + line;
    }, '');
  },
  // Removes trailing # comments, along with preceding whitespace
  // Returns an array of objects (one for each line) to be passed to extractCode.
  trimComments: function(code) {
    var lines = [];
    code.split(/\n/).forEach(line => {
      var segs = line.split(/(\s*#)/);
      var ln = {code: segs[0]};
      if (segs.length > 1)
        ln.comment = segs.reduce((c, seg, i) => i > 1 ? c + seg : seg, '');
      lines.push(ln);
    });
    return lines;
  },
  extractCode: function(lineObjs, withComments) {
    return lineObjs.reduce((acc, line, i, lines) => {
      return acc + line.code + (line.comment && withComments ? line.comment : '') + (i < lines.length - 1 ? '\n' : '');
    }, ''); 
  }
};