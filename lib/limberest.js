'use strict';

const postman = require('./postman');
const group = require('./group');
const compare = require('./compare');
const Storage = require('./storage').Storage;
const Retrieval = require('./retrieval').Retrieval;
const Case = require('./case').Case;
const GitHub = require('./github').GitHub;
const Options = require('./options').Options;

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

// Does not merge local storage.
Limberest.prototype.loadGroupSync = function(location) {
  const obj = JSON.parse(new Storage(location).read());
  if (postman.isGroup(obj)) {
    return group.create(location, postman.group(obj));
  }
  else {
    return group.create(location, obj);
  }
};

// Does not merge local storage.
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

// Merges local storage if retrieved from remote.
Limberest.prototype.loadEnvs = function(options, callback) {
  options = new Options(options).options;
  var source;
  if (options.location.startsWith('https://') || options.location.startsWith('http://')) {
    source = new GitHub(options.location);
  }
  else {
    source = new Storage(options.location);
  }
  source.getMatches(options, function(err, matches) {
    var testEnvs = {};
    matches.forEach(match => {
      var obj = JSON.parse(match.contents);
      var testEnv = postman.isEnv(obj) ? postman.env(obj) : obj;
      if (options.localLocation) {
        // merge from local
        var storage = new Storage(options.localLocation + '/' + testEnv.name);
        if (storage.exists()) {
          testEnv = storage.read();
        }
      }
      if (obj.name)
        testEnvs[obj.name] = testEnv;
      else
        testEnvs[match.name] = testEnv;
    });
    callback(err, testEnvs);
 });
};

// Merges local storage if retrieved from remote.
Limberest.prototype.loadGroups = function(options, callback) {
  options = new Options(options).options;
  var source;
  if (options.location.startsWith('https://') || options.location.startsWith('http://')) {
    source = new GitHub(options.location);
  }
  else {
    source = new Storage(options.location);
  }
  source.getMatches(options, function(err, matches) {
    var testGroups = [];
    matches.forEach(match => {
      var obj = JSON.parse(match.contents);
      var testGroup;
      if (postman.isGroup(obj)) {
        testGroup = group.create(match.location, postman.group(obj));
      }
      else {
        testGroup = group.create(match.location, obj);
      }

      if (options.localLocation) {
        // merge from local (individual tests)
        testGroup.tests.forEach(test => {
          var storage = new Storage(options.localLocation + '/' + testGroup.name, test.name);
          if (storage.exists()) {
            var localTest = storage.read();
            if (localTest.request) {
              test.request = localTest.request;
            }
          }
        });
      }
      
      testGroups.push(testGroup);
    });
    callback(err, testGroups);  
  });    
};

// In the future, groupName may be used to further qualify expected location.
// (We already 
Limberest.prototype.loadExpected = function(groupName, method, testName, options, callback) {
  options = new Options(options).options;
  var resName = method;
  if (resName == 'DELETE')
    resName = 'DEL';
  else if (resName == 'OPTIONS')
    resName = 'OPT';
  var resName = resName + '_' + testName + '.yaml';
  if (options.localLocation) {
    // check first in local
    var storage = new Storage(options.localLocation + '/' + testGroup.name, resName);
    if (storage.exists()) {
      callback(null, storage.read());
      return;
    }
  }
  
  new Retrieval(options.expectedResultLocation, resName).load((err, data) => {
    callback(err, data);
  });
};


Limberest.prototype.getRequest = function() {
  if (typeof window === 'undefined') {
    return require('request').defaults({headers: {'User-Agent': 'limberest'}});
  } 
  else {
    return require('browser-request');
  }
};

Limberest.prototype.GitHub = GitHub;
Limberest.prototype.Storage = Storage;
Limberest.prototype.Retrieval = Retrieval;
Limberest.prototype.Case = Case;
Limberest.prototype.compare = compare;
module.exports = new Limberest();