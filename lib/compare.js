'use strict';

const diff = require('diff');
const subst = require('./subst');

// Options are the same as jsdiff.
function Compare() {
}

Compare.prototype.diffLines = function(expected, actual, values, options) {
  // must always end with newline (https://github.com/kpdecker/jsdiff/issues/68)
  if (!expected.endsWith('\n'))
    expected += '\n';
  if (!actual.endsWith('\n'))
    actual += '\n';

  var diffs = diff.diffLines(expected, actual, options);
  return this.markIgnored(diffs, values, options);
};

Compare.prototype.diffWords = function(expected, actual, values, options) {
  var diffs = diff.diffWordsWithSpace(expected, actual, options);
  return this.markIgnored(diffs, values, options);
};

Compare.prototype.markIgnored = function(diffs, values, options) {
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].removed && diffs.length > i + 1 && diffs[i + 1].added) {
      var exp = subst.replace(diffs[i].value, values);
      var act = diffs[i + 1].value;
      if (exp === act) {
        diffs[i].ignored = diffs[i + 1].ignored = true;
      }
      else if (exp.indexOf('${~') >= 0) {
        var regex = exp.replace(/\$\{~.+?}/g, (match) => {
          return '(' + match.substr(3, match.length - 4) + ')';
        });
        var match = act.match(new RegExp(regex));
        if (match && match[0].length == act.length) {
          diffs[i].ignored = diffs[i + 1].ignored = true;
        }
      }
    }
  }
  return diffs;
};

module.exports = new Compare();