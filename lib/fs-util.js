'use strict';

const fs = require('fs');

module.exports = {
  mkdirsSync: function(dir) {
    dir.replace(/\\/gm, '/').split(/\//).reduce((acc, seg, i) => {
      var path = acc + seg;
      if (!path.endsWith(':')) {
        if (!fs.existsSync(path)) {
          fs.mkdirSync(path);
        }
      }
      return path + '/';
    }, '');
  }
} 