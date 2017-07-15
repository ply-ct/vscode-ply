'use strict';

const fs = require('fs');
const path = require('path');
const codes = require('builtin-status-codes');
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

Limberest.prototype.loadEnvSync = function(file) {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    return postman.isEnv(obj) ? postman.env(obj) : obj;
};

Limberest.prototype.loadEnv = function(location, callback) {
  if (typeof callback !== 'function')
    throw new Error('Callback function required for env location: ' + location);
  
  const parseEnvAndCall = function(er, data, cb) {
    var env;
    if (!er) {
      try {
        const obj = JSON.parse(data);
        env = postman.isEnv(obj) ? postman.env(obj) : obj;
      }
      catch (e) {
        er = e;
      }
    }
    cb(er, env);
  };
  
  if (isUrl(location)) {
    this.getRequest()(location, function(err, response, body) {
      if (response.statusCode != 200)
        err = new Error(response.statusCode + ': ' + codes[response.statusCode]);
      parseEnvAndCall(err, body, callback);
    });
  }
  else {
    fs.readFile(location, 'utf8', function(err, data) {
      parseEnvAndCall(err, data, callback);
    });
  }
};

// TODO: where location is url
Limberest.prototype.loadGroupSync = function(file) {
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (postman.isGroup(obj)) {
    return group.create(location, postman.group(obj));
  }
  else {
    return group.create(location, obj);
  }
};

Limberest.prototype.loadGroup = function(location, callback) {
  if (typeof callback !== 'function')
    throw new Error('Callback function required for group location: ' + location);
  
  const parseGroupAndCall = function(er, data, cb) {
    var grp;
    if (!er) {
      try {
        const obj = JSON.parse(data);
        if (postman.isGroup(obj)) {
          grp = group.create(location, postman.group(obj));
        }
        else {
          grp = group.create(location, obj);
        }
      }
      catch (e) {
        er = e;
      }
    }
    cb(er, grp);
  };
  
  if (isUrl(location)) {
    this.getRequest()(location, function(err, response, body) {
      if (response.statusCode != 200)
        err = new Error(response.statusCode + ': ' + codes[response.statusCode]);
      parseGroupAndCall(err, body, callback);
    });
  }
  else {
    fs.readFile(location, 'utf8', function(err, data) {
      parseGroupAndCall(err, data, callback);
    });
  }
  
};

Limberest.prototype.loadGroups = function(options, callback) {
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

Limberest.prototype.getRequest = function() {
  if (typeof window === 'undefined') {
    return require('request').defaults({headers: {'User-Agent': 'limberest'}});
  } 
  else {
    return require('browser-request');
  }
}

Limberest.prototype.GitHub = GitHub;
Limberest.prototype.Case = testCase.Case;
Limberest.prototype.compare = compare;
module.exports = new Limberest();