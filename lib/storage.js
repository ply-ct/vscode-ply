'use strict';

const fs = require('fs');

var Storage = function(location, name) {
  this.location = location;
  this.name = name;
  if (typeof localStorage === "undefined" || localStorage === null) {
    // require('mkdirp').sync(this.path);
    this.name = require('sanitize-filename')(this.name, {replacement: '_'});
  }
  else {
    this.localStorage = localStorage;
  }
  this.path = this.location + '/' + this.name;
}

Storage.prototype.read = function() {
  if (this.localStorage) {
    return this.localStorage.getItem(this.path);
  }
  else {
    if (fs.existsSync(this.path))
      return fs.readFileSync(this.path, 'utf-8');
    else
      return null;
  }
};

Storage.prototype.append = function(value) {
  if (this.localStorage) {
    this.localStorage.setItem(this.path, value);
  }
  else {
    fs.appendFileSync(this.path, value);
  }
};

Storage.prototype.remove = function() {
  if (this.localStorage) {
    this.localStorage.removeItem(this.path);
  }
  else {
    if (fs.existsSync(this.path))
      fs.unlinkSync(this.path);
  }
};

Storage.prototype.exists = function() {
  if (this.localStorage) {
    return this.localStorage.getItem(this.path) !== null;
  }
  else {
    return fs.existsSync(this.path);
  }
}

Storage.prototype.toString = function storageToString() {
  return this.path;
}

exports.Storage = Storage;