'use strict';

const fs = require('fs');
const path = require('path');
const postman = require('./postman');
const group = require('./group');
const testCase = require('./case');
const compare = require('./compare');
const GitHub = require('./github').GitHub;
const Storage = require('./storage').Storage;

const isUrl = function(location) {
  return location.startsWith('http://') || location.startsWith('https://');
};

function Limberest() {
}

Limberest.prototype.env = function(file) {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
  return postman.isEnv(obj) ? postman.env(obj) : obj;
};

// TODO: where location is url
Limberest.prototype.group = function(location) {
  const obj = JSON.parse(fs.readFileSync(location, 'utf8'));
  if (postman.isGroup(obj)) {
    return group.create(location, postman.group(obj));
  }
  else {
    return group.create(location, obj);
  }
};

Limberest.prototype.retrieveTestGroups = function(options, callback) {
  var source = isUrl(options.location) ? new GitHub(options.location) : new Storage(options.location);
  source.getMatches(options, function(err, matches) {
    var testGroups = [];
    matches.forEach(match => {
      var obj = JSON.parse(match.contents);
      if (postman.isGroup(obj)) {
        testGroups.push(group.create(match.location, postman.group(obj)));
      }
      else {
        testGroups.push(group.create(match.location, obj));
      }
    });
    callback(err, testGroups);  
  });    
};

Limberest.prototype.GitHub = GitHub;
Limberest.prototype.Case = testCase.Case;
Limberest.prototype.compare = compare;
module.exports = new Limberest();