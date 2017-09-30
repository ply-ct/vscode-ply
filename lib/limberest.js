'use strict';

const postman = require('./postman');
const group = require('./group');
const compare = require('./compare');
const subst = require('./subst');
const Storage = require('./storage').Storage;
const Retrieval = require('./retrieval').Retrieval;
const Case = require('./case').Case;
const GitHub = require('./github').GitHub;
const Options = require('./options').Options;
const Logger = require('./logger').Logger;

function Limberest() {
}

Limberest.prototype.getLogger = function(options) {
  return new Logger({
    level: options.debug ? 'debug' : 'info',
    location: options.logLocation,
    name: 'limberest.log', 
    retain: options.retainLog
  });  
};

Limberest.prototype.loadValuesSync = function(location) {
  const obj = JSON.parse(new Storage(location).read());
  if (!obj)
    throw new Error('Values not found: ' + location);
  return postman.isEnv(obj) ? postman.values(obj) : obj;
};

// Does not merge local storage.
Limberest.prototype.loadValues = function(location, callback) {
  var vals;
  this.loadValuesRaw(location, function(err, data) {
    if (!err) {
      try {
        if (!data)
          throw new Error('Values not found: ' + location);
        const obj = JSON.parse(data);
        vals = postman.isEnv(obj) ? postman.values(obj) : obj;
      }
      catch (e) {
        callback(e);
      }
    }
    callback(err, vals);
  });
};

Limberest.prototype.loadFile = function(location, callback) {
  if (typeof callback !== 'function')
    throw new Error('Callback function required for file location: ' + location);
  new Retrieval(location).load(callback);
};

// Merges local storage if retrieved from remote.
Limberest.prototype.loadFiles = function(options, callback) {
  options = new Options(options).options;
  var source;
  if (options.location.startsWith('https://') || options.location.startsWith('http://')) {
    source = new GitHub(options.location);
  }
  else {
    source = new Storage(options.location);
  }
  source.getMatches(options, function(err, matches) {
    var files = [];
    matches.forEach(match => {
      if (options.localLocation) {
        var localLoc = options.localLocation;
        if (options.qualifier)
          localLoc += '/' + qualifier;
        // merge from local
        var storage = new Storage(localLoc + '/' + match.path);
        if (storage.exists()) {
          if (options.debug)
            console.log('Merging from local: ' + storage);
          match.contents = storage.read();
          match.location = localLoc + '/' + match.path;
        }
      }
      files.push(match);
    });
    callback(err, files);
 });
};

// Updates local storage.  Does not save to origin.
Limberest.prototype.updateFile = function(options, file) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var storage = new Storage(options.localLocation + '/' + file.path);
  storage.write(file.contents);
  file.location = options.localLocation + '/' + file.path;
};

// Removes local storage override.
Limberest.prototype.discardFile = function(options, file) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var storage = new Storage(options.localLocation + '/' + file.path);
  storage.remove();
  file.location = file.origin;
}

// Saves from local storage to origin.
Limberest.prototype.saveFile = function(options, valuesFile, callback) {
  
};

Limberest.prototype.updateTest = function(options, groupName, test) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(test);
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.write(JSON.stringify({
    name: test.name,
    request: test.request
  }, null, 2));
  test.location = options.localLocation + '/' + groupName + '/' + resName;  
};

Limberest.prototype.discardTest = function(options, groupName, test) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(test);
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.remove();
  delete test.location;
};

Limberest.prototype.saveTest = function(options, groupName, test) {
  
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
Limberest.prototype.loadGroups = function(options, callback) {
  options = new Options(options).options;
  var source;
  if (options.location.startsWith('https://') || options.location.startsWith('http://')) {
    source = new GitHub(options.location);
  }
  else {
    source = new Storage(options.location);
  }
  var limbThis = this;
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
          var storage = new Storage(options.localLocation + '/' + testGroup.name, 
                limbThis.getResourceName(test));
          if (storage.exists()) {
            var localTest = storage.read();
            if (localTest.request) {
              test.request = localTest.request;
              test = Object.assign({_local:true}, test);
            }
            test.location = storage.path;
          }
          storage = new Storage(options.localLocation + '/' + testGroup.name, 
              limbThis.getResourceName(test.request.method, test.name, 'yaml'));
          if (storage.exists())
            test.expectedLocation = storage.path;  // indicate exp res overridden
        });
      }
      
      testGroups.push(testGroup);
    });
    callback(err, testGroups);  
  });    
};

Limberest.prototype.loadExpected = function(groupName, test, options, callback) {
  options = new Options(options).options;
  var resName = this.getResourceName(test.request.method, test.name, 'yaml');
  if (options.localLocation) {
    // check first in local
    var storage = new Storage(options.localLocation + '/' + groupName, resName);
    this.getLogger(options).debug('Loading expected result: ' + storage);
    if (storage.exists()) {
      test.expectedLocation = options.localLocation + '/' + groupName + '/' + resName;
      callback(null, storage.read());
      return;
    }
  }
  var retrieval = new Retrieval(options.expectedResultLocation + '/' + groupName, resName);
  this.getLogger(options).debug('Loading expected result: ' + retrieval);
  retrieval.load((err, data) => {
    callback(err, data);
  });
};

Limberest.prototype.updateExpectedResult = function(options, groupName, test, result) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(test.request.method, test.name, 'yaml');
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.write(result);
  test.expectedLocation = options.localLocation + '/' + groupName + '/' + resName;  
};

Limberest.prototype.discardExpectedResult = function(options, groupName, test, result) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(test.request.method, test.name, 'yaml');
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.remove();
  delete test.expectedLocation;
};

Limberest.prototype.saveExpectedResult = function(options, groupName, test, result) {
  
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
  if (typeof method === 'object') {
    // actually a test passed
    meth = method.request.method;
    testName = method.name;
    ext = 'test';
  }
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
Limberest.prototype.postman = postman;
Limberest.prototype.compare = compare;
Limberest.prototype.subst = subst;
Limberest.prototype.createGroup = group.create;
module.exports = new Limberest();