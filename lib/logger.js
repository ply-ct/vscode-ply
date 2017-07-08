'use strict';

// Simple replacement for winston logging due to unclosed file handles.
// https://github.com/winstonjs/winston/issues/711

const fs = require('fs');
const path = require('path');
const defaults = require('defaults');
const mkdirsSync = require('./fs-util').mkdirsSync;

const levels = {
    error: 0,
    info: 1,
    debug: 3
}

const defaultOptions = {
  level: 'info',
  file: null,
  retain: true
};

var Logger = function(options) {
  this.options = defaults(options, defaultOptions);
  this.level = levels[this.options.level];
  if (this.options.file && !this.options.retain) {
    if (fs.existsSync(this.options.file))
      fs.unlinkSync(this.options.file);
  }
};

Logger.prototype.log = function(level, message, obj) {
  if (level <= this.level) {
    if (level == levels.error) {
      console.error(message);
      if (obj)
        console.error(obj);
    }
    else {
      console.log(message);
      if (obj)
        console.log(obj);
    }
    if (this.options.file) {
      mkdirsSync(path.dirname(this.options.file));
      fs.appendFileSync(this.options.file, message + '\n');
      if (obj)
        fs.appendFileSync(obj + '\n');
    }
  }
};

Logger.prototype.info = function(message, obj) {
  this.log(levels.info, message, obj);
};

Logger.prototype.debug = function(message, obj) {
  this.log(levels.debug, message, obj);
};

Logger.prototype.error = function(message, obj) {
  this.log(levels.error, message, obj);
};

exports.Logger = Logger;