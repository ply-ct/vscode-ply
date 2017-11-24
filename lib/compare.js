'use strict';

const jsdiff = require('diff');
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

  var diffs = jsdiff.diffLines(expected, actual, options);
  if (values) {
    return this.markIgnored(diffs, values);
  }
  else {
    return diffs;
  }
};

Compare.prototype.markIgnored = function(diffs, values) {
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

Compare.prototype.mirrorDiffs = function(diffs) {
  if (diffs) {
    var mirroredDiffs = [];
    for (let i = 0; i < diffs.length; i++) {
      var diff = diffs[i];
      if (diff.removed) {
        var correspondingAdd = (i < diffs.length - 1 && diffs[i + 1].added) ? diffs[i + 1] : null;
        if (correspondingAdd) {
          var remove = Object.assign({}, correspondingAdd);
          delete remove.added;
          remove.removed = true;
          mirroredDiffs.push(remove);
          i++; // corresponding add already covered
        }
        var add = Object.assign({}, diff);
        delete add.removed;
        add.added = true;
        mirroredDiffs.push(add);
      }
      else if (diff.added) {
        var rem = Object.assign({}, diff);
        delete rem.added;
        rem.removed = true;
        mirroredDiffs.push(rem);
      }
      else {
        mirroredDiffs.push(diff);
      }
    }
    return mirroredDiffs;
  }
};

Compare.prototype.markLines = function(start, lines, ignored) {
  var markers = [];
  var linesIdx = 0;
  lines.forEach(line => {
    var marker = {
      start: start + linesIdx, 
      end: start + linesIdx + line.length + 1,
    };
    if (ignored)
      marker.ignored = true;
    markers.push(marker);
    linesIdx += line.length + 1;
  });
  return markers;
};

Compare.prototype.getMarkers = function(diffs, lines) {
  var markers = [];
  if (diffs) {
    var idx = 0;
    var lineIdx = 0;
    for (let i = 0; i < diffs.length; i++) {
      var diff = diffs[i];
      if (diff.removed) {
        var correspondingAdd = (i < diffs.length - 1 && diffs[i + 1].added) ? diffs[i + 1] : null;
        var oldLines = diff.value.replace(/\n$/, '').split(/\n/);
        if (correspondingAdd) {
          // diff each line
          var newLines = correspondingAdd.value.replace(/\n$/, '').split(/\n/);
          for (let j = 0; j < oldLines.length && j < newLines.length; j++) {
            jsdiff.diffWordsWithSpace(oldLines[j], newLines[j]).forEach(lineDiff => {
              if (lineDiff.removed) {
                var marker = {
                  start: idx,
                  end: idx + lineDiff.value.length,
                };
                if (diff.ignored)
                  marker.ignored = true;
                markers.push(marker);
                idx += lineDiff.value.length;
              }
              else if (!lineDiff.added) {
                idx += lineDiff.value.length;
              }
            });
            idx++; // newLine
          }
          // TODO: handle oldLines > newLines or vice-versa
        }
        else {
          // mark every line
          markers.push.apply(markers, this.markLines(idx, oldLines, diff.ignored));
        }
  
        if (correspondingAdd) {
          i++; // corresponding add already covered
        }
        
        // account for ignored comments
        if (lines && lines[lineIdx].comment) {
          idx += lines[lineIdx].comment.length;
        }
        lineIdx += diff.count;
      }
      else if (!diff.added) {
        idx += diff.value.length;
        // account for ignored comments
        if (lines && lines[lineIdx].comment) {
          idx += lines[lineIdx].comment.length;
        }
        lineIdx += diff.count;
      }
    }
  }
  
  return markers;
};

module.exports = new Compare();