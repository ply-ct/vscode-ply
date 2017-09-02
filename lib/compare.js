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

Compare.prototype.markLines = function(start, lines, ignored) {
  var linesIdx = 0;
  lines.forEach(line => {
    var marker = {
      start: start + linesIdx, 
      end: start + linesIdx + line.length + 1,
    };
    if (ignored)
      marker.ignored = true;
    markers.push(ignored);
    lineIdx += line.length + 1;
  });
}

Compare.prototype.getMarkers = function(diffs, fromLeft) {
  var markers = [];
  
  if (diffs) {
    
    diffs.forEach(diff => {
      console.log((fromLeft ? 'E:' : 'A:') + "DIFF: " + JSON.stringify(diff));
    });
    
    var isLeft = fromLeft;
    var leftIdx = 0;
    var rightIdx = 0;
    for (let i = 0; i < diffs.length; i++) {
      var diff = diffs[i];
      if (diff.removed) {
        var correspondingAdd = (i < diffs.length - 1 && diffs[i + 1].added) ? diffs[i + 1] : null;
        var leftLines = diff.value.replace(/\n$/, '').split(/\n/);
        if (correspondingAdd) {
          // diff each line
          var rightLines = correspondingAdd.value.replace(/\n$/, '').split(/\n/);
          var diffLinesIdx = 0;
          for (let j = 0; j < leftLines.length && j < rightLines.length; j++) {
            var oldLine = isLeft ? leftLines[j] : rightLines[j];
            var newLine = isLeft ? rightLines[j] : leftLines[j];
            var lineIdx = 0;
            jsdiff.diffWordsWithSpace(oldLine, newLine).forEach(lineDiff => {
              console.log((fromLeft ? 'LEFT ' : 'RIGHT ') + "LINE DIFF: " + JSON.stringify(lineDiff));
              if (lineDiff.removed) {
                var marker = {
                  start: leftIdx + diffLinesIdx + lineIdx,
                  end: leftIdx + diffLinesIdx + lineIdx + lineDiff.value.length,
                };
                if (diff.ignored)
                  marker.ignored = true;
                markers.push(marker);
                lineIdx += lineDiff.value.length;
  //              if (isLeft) {
  //              }
              }
  //            else if (lineDiff.added) {
  //              if (!isLeft) {
  //                markers.push({
  //                  start: rightIdx + diffLinesIdx + lineIdx, 
  //                  end: rightIdx + diffLinesIdx + lineIdx + lineDiff.value.length,
  //                  className: diff.ignored ? props.ignoredClass : props.diffClass
  //                });
  //                lineIdx += lineDiff.value.length;
  //              }
  //            }
              else {
                lineIdx += lineDiff.value.length;
              }
            });
            diffLinesIdx += (isLeft ? oldLine.length : newLine.length);
          }
          // TODO: handle leftLines > rightLines or vice-versa
        }
        else {
          if (isLeft) {
            // mark every line
            markLines(leftIdx, leftLines, diff.ignored);
          }
        }
  
        leftIdx += diff.value.length;
        if (correspondingAdd) {
          i++; // corresponding add already covered
          rightIdx += correspondingAdd.value.length;
        }
      }
      else if (diff.added) {
        // added with no corresponding remove
        if (!isLeft) {
          // mark every line
          var rtLines = diff.value.replace(/\n$/, '').split(/\n/);
          markLines(rightIdx, rtLines, diff.ignored);
        }
  
        rightIdx += diff.value.length; 
      }
      else {
        leftIdx += diff.value.length;
        rightIdx += diff.value.length;
      }
    }
  }
  
  return markers;
};

module.exports = new Compare();