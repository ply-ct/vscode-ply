'use strict';

const postman = require('./postman');
const group = require('./group');
const compare = require('./compare');
const Storage = require('./storage').Storage;
const Retrieval = require('./retrieval').Retrieval;
const Case = require('./case').Case;
const GitHub = require('./github').GitHub;

function Limberest() {
}

Limberest.prototype.loadEnvSync = function(location) {
  const obj = JSON.parse(new Storage(location).read());
  return postman.isEnv(obj) ? postman.env(obj) : obj;
};

Limberest.prototype.loadEnv = function(location, callback) {
  if (typeof callback !== 'function')
    throw new Error('Callback function required for env location: ' + location);
  var retrieval = new Retrieval(location).load(function(err, data) {
    var env;
    if (!err) {
      try {
        const obj = JSON.parse(data);
        env = postman.isEnv(obj) ? postman.env(obj) : obj;
      }
      catch (e) {
        err = e;
      }
    }
    callback(err, env);
  });
};

Limberest.prototype.loadGroupSync = function(location) {
  const obj = JSON.parse(new Storage(location).read());
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
  
  new Retrieval(location).load(function(err, data) {
    var grp;
    if (!err) {
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
        err = e;
      }
    }
    callback(err, grp);
  });  
};

Limberest.prototype.loadGroups = function(options, callback) {
  if (!options.location)
    throw new Error('Required: options.location');
  var source;
  if (options.location.startsWith('https://') || options.location.startsWith('http://'))
    source = new GitHub(options.location);
  else
    source = new Storage(options.location);
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
Limberest.prototype.Storage = Storage;
Limberest.prototype.Retrieval = Retrieval;
Limberest.prototype.Case = Case;
Limberest.prototype.compare = compare;
module.exports = new Limberest();