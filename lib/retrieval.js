'use strict';

const Storage = require('./storage').Storage;
const codes = require('builtin-status-codes');

// Abstraction that uses either URL retrieval or storage.
// name is optional
var Retrieval = function(location, name) {
  
  this.location = location;
  this.name = name;

  if (this.isUrl(location)) {
    if (this.name)
      this.name = require('sanitize-filename')(this.name, {replacement: '_'});
    if (typeof window === 'undefined')
      this.request = require('request').defaults({headers: {'User-Agent': 'limberest'}});
    else
      this.request = require('browser-request');
  }
  else {
    this.storage = new Storage(this.location, this.name);    
  }

  this.path = this.location;
  if (this.name)
    this.path += '/' + this.name;
};

Retrieval.prototype.load = function(callback) {
  if (this.request) {
    const url = this.path;
    this.request(this.path, function(err, response, body) {
      if (response.statusCode != 200) {
        err = new Error(url + ' --> ' + response.statusCode + ': ' + codes[response.statusCode]);
        err.code = response.statusCode;
      }
      callback(err, err ? null : body);
    });
  }
  else {
    return this.storage.read(callback);
  }
};

Retrieval.prototype.loadSync = function() {
  if (this.request)
    throw new Error('Synchronized load not supported for: ' + this.path);
  else
    return this.storage.read();
};

Retrieval.prototype.isUrl = function(location) {
  return location.startsWith('https://') || location.startsWith('http://');
};

Retrieval.prototype.toString = function retrievalToString() {
  if (this.storage)
    return this.storage.toString();
  else
    return this.path;
};

exports.Retrieval = Retrieval;