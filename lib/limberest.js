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

Limberest.prototype.loadValuesSync = function(location) {
  const obj = JSON.parse(new Storage(location).read());
  return postman.isEnv(obj) ? postman.values(obj) : obj;
};

Limberest.prototype.loadValues = function(location, callback) {
  if (typeof callback !== 'function')
    throw new Error('Callback function required for values location: ' + location);
  var retrieval = new Retrieval(location).load(function(err, data) {
    var vals;
    if (!err) {
      try {
        const obj = JSON.parse(data);
        vals = postman.isEnv(obj) ? postman.values(obj) : obj;
      }
      catch (e) {
        vals = e;
      }
    }
    callback(err, vals);
  });
};

// Does not merge local storage.
Limberest.prototype.loadGroupSync = function(location) {
  const obj = JSON.parse(new Storage(location).read());
  if (postman.isCollection(obj)) {
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
        if (postman.isCollection(obj)) {
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
Limberest.prototype.loadValueObjs = function(options, callback) {
  options = new Options(options).options;
  var source;
  if (options.location.startsWith('https://') || options.location.startsWith('http://')) {
    source = new GitHub(options.location);
  }
  else {
    source = new Storage(options.location);
  }
  source.getMatches(options, function(err, matches) {
    var valueObjs = {};
    matches.forEach(match => {
      var obj = JSON.parse(match.contents);
      var testVals = postman.isEnv(obj) ? postman.values(obj) : obj;
      if (options.localLocation) {
        // merge from local
        var storage = new Storage(options.localLocation + '/' + testVals.name);
        if (storage.exists()) {
          testVals = storage.read();
        }
      }
      valueObjs[match.name] = testVals;
    });
    callback(err, valueObjs);
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
      if (postman.isCollection(obj)) {
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

Limberest.prototype.loadExpected = function(groupName, method, testName, options, callback) {
  options = new Options(options).options;
  var resName = this.getResourceName(method, testName, 'yaml');
  if (options.localLocation) {
    // check first in local
    var storage = new Storage(options.localLocation + '/' + groupName, resName);
    if (storage.exists()) {
      callback(null, storage.read());
      return;
    }
  }
  new Retrieval(options.expectedResultLocation + '/' + groupName, resName).load((err, data) => {
    callback(err, data);
  });
};

Limberest.prototype.loadActual = function(groupName, method, testName, options, callback) {
  var resName = this.getResourceName(method, testName, 'yaml');
  var storage = new Storage(new Options(options).options.resultLocation + '/' + groupName, resName);
  callback(null, storage.exists ? storage.read() : null);
};

Limberest.prototype.loadLog = function(groupName, method, testName, options, callback) {
  var resName = this.getResourceName(method, testName, 'log');
  var storage = new Storage(new Options(options).options.logLocation + '/' + groupName, resName);
  callback(null, storage.exists ? storage.read() : null);
};

// abbreviated method for naming
Limberest.prototype.getResourceName = function(method, testName, ext) {
  var meth = method;
  if (meth == 'DELETE')
    meth = 'DEL';
  else if (meth == 'OPTIONS')
    meth = 'OPT';
  return meth + ':' + testName + '.' + ext;
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
Limberest.prototype.createGroup = group.create;
module.exports = new Limberest();