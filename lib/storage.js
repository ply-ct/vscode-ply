'use strict';

const fs = require('fs');

var Storage = function(location, name) {
  this.location = location;
  this.name = name;
  if (location.startsWith('http://') || location.startsWith('https://')) {
    this.url = location + '/' + name;
  }
  else {
    if (typeof localStorage === 'undefined' || localStorage === null) {
      this.name = require('sanitize-filename')(this.name, {replacement: '_'});
      require('mkdirp').sync(this.location + '/' + this.path);
    }
    else {
      this.localStorage = localStorage;
    }
    this.path = this.location + '/' + this.name;
  }
}

Storage.prototype.read = function(callback) {
  if (this.url) {
    var request;
    if (typeof window === 'undefined' || window == null) {
      request = require('request');
    } 
    else {
      request = require('browser-request');
    }
    request(url, function(error, response) {
      callback(body);
    });
  }
  else if (this.localStorage) {
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
  if (this.url) {
    throw new Error('Unsupported for URL location: append()');
  }
  if (this.localStorage) {
    this.localStorage.setItem(this.path, value);
  }
  else {
    fs.appendFileSync(this.path, value);
  }
};

Storage.prototype.remove = function() {
  if (this.url) {
    throw new Error('Unsupported for URL location: remove()');
  }
  if (this.localStorage) {
    this.localStorage.removeItem(this.path);
  }
  else {
    if (fs.existsSync(this.path))
      fs.unlinkSync(this.path);
  }
};

Storage.prototype.exists = function() {
  if (this.url) {
    throw new Error('Unsupported for URL location: exists()'); // for now
  }
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