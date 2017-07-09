'use strict';

// TODO: if browser, only log >= error to console 

const defaults = require('defaults');
const storage = require('./storage');

const levels = {
    error: 0,
    info: 1,
    debug: 3
}

const defaultOptions = {
  level: 'info',
  retain: true
};

var Logger = function(options) {
  this.options = defaults(options, defaultOptions);
  this.level = levels[this.options.level];
  if (this.options.location && this.options.name) {
    this.storage = new (storage.Storage)(this.options.location, this.options.name);
    if (!this.options.retain) {
      this.storage.remove();
    }
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
      this.storage.append(message + '\n');
      if (obj)
        this.storage.append(obj + '\n');
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