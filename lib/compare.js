'use strict';

const diff = require('diff');
const subst = require('./subst');

function Compare() {
}

// options are the same as jsdiff
Compare.prototype.diffLines = function(expected, actual, values, options) {
  // must always end with newline (https://github.com/kpdecker/jsdiff/issues/68)
  if (!expected.endsWith('\n'))
    expected += '\n';
  if (!actual.endsWith('\n'))
    actual += '\n';
  
  var changes = diff.diffLines(expected, actual, options);
  for (let i = 0; i < changes.length; i++) {
    if (changes[i].removed && changes.length > i + 1 && changes[i + 1].added) {
      var exp = subst.replace(changes[i].value, values);
      var act = changes[i + 1].value;
      if (exp === act) {
        changes[i].ignored = changes[i + 1].ignored = true;
      }
      else if (exp.indexOf('${~') >= 0) {
        var regex = exp.replace(/\$\{~.+?}/g, (match) => {
          return '(' + match.substr(3, match.length - 4) + ')';
        });
        if (new RegExp(regex).test(act))
          changes[i].ignored = changes[i + 1].ignored = true;
      }
    }
  }
  return changes;
};

module.exports = new Compare();