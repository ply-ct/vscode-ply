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

Limberest.prototype.loadValues = function(options, paths, callback) {
  const async = require('async');
  var vals = {};
  async.map(paths, function(path, callback) {
    var loc = options.location + '/' + path;
    new Retrieval(loc).load(function(err, data) {
      if (!err) {
        try {
          var obj = JSON.parse(data);
          obj = postman.isEnv(obj) ? postman.values(obj) : obj;
          vals = Object.assign(vals, obj);
        }
        catch (e) {
          err = e;
        }
      }
      callback(err, vals);
    });
  }, function(err, paths) {  // eslint-disable-line no-unused-vars
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
    var files = matches.slice();
    if (options.localLocation) {
      var localLoc = options.localLocation;
      if (options.qualifier)
        localLoc += '/' + options.qualifier;
      // find local-only files
      var storage = new Storage(localLoc + '/' + options.path);
      if (storage.exists()) {
        JSON.parse(storage.read()).forEach(localFile => {
          var matchingExt = options.extensions.find(ext => {
            return localFile.name.endsWith(ext);
          });
          if (matchingExt) {
            files.push(localFile);
          }
        });
      }
      files.forEach(file => {
        // merge from local
        storage = new Storage(localLoc + '/' + file.path);
        if (storage.exists()) {
          if (options.debug)
            console.log('Merging from local: ' + storage);
          file.contents = storage.read();
          file.location = localLoc + '/' + file.path;
        }
      });
    }
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
};

// Creates in local storage.  Does not save to origin.
Limberest.prototype.createFile = function(options, file) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var storage = new Storage(options.localLocation + '/' + file.path);
  file.contents = '';
  file.location = options.localLocation + '/' + file.path;
  // add to local-only files
  var localFiles = [];
  storage = new Storage(options.localLocation + '/' + options.path);
  if (storage.exists()) {
    localFiles = JSON.parse(storage.read());
  }
  localFiles.push(file);
  storage.write(JSON.stringify(localFiles));
};

// Saves from local storage to origin.
Limberest.prototype.saveFile = function(options, valuesFile, callback) {  // eslint-disable-line no-unused-vars
  
};

Limberest.prototype.updateRequest = function(options, groupName, request) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(request);
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.write(JSON.stringify(request, null, 2));
  request.location = options.localLocation + '/' + groupName + '/' + resName;  
};

Limberest.prototype.discardTest = function(options, groupName, test) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(test);
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.remove();
  delete test.location;
};

Limberest.prototype.saveTest = function(options, groupName, test) { // eslint-disable-line no-unused-vars
  
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
    var reqGroups = [];
    matches.forEach(match => {
      var obj = JSON.parse(match.contents);
      var reqGroup;
      if (postman.isCollection(obj)) {
        reqGroup = group.create(match.location, postman.group(obj));
      }
      else {
        reqGroup = group.create(match.location, obj);
      }

      if (options.localLocation) {
        // merge from local (individual tests)
        reqGroup.requests.forEach(request => {
          var storage = new Storage(options.localLocation + '/' + reqGroup.name, 
                limbThis.getResourceName(request));
          if (storage.exists()) {
            var requestStr = storage.read();
            if (requestStr) {
              request._local = true;
              var localRequest = JSON.parse(requestStr);
              request.method = localRequest.method;
              request.url = localRequest.url;
              request.headers = localRequest.headers;
              request.body = localRequest.body;
              request.location = storage.path;
            }
          }
          storage = new Storage(options.localLocation + '/' + reqGroup.name, 
              limbThis.getResourceName(request.method, request.name, 'yaml'));
          if (storage.exists())
            request.expectedLocation = storage.path;  // indicate exp res overridden
        });
      }
      
      reqGroups.push(reqGroup);
    });
    callback(err, reqGroups);  
  });    
};

Limberest.prototype.loadExpected = function(groupName, request, options, callback) {
  options = new Options(options).options;
  var resName = this.getResourceName(request.method, request.name, 'yaml');
  if (options.localLocation) {
    // check first in local
    var storage = new Storage(options.localLocation + '/' + groupName, resName);
    this.getLogger(options).debug('Loading expected result: ' + storage);
    if (storage.exists()) {
      request.expectedLocation = options.localLocation + '/' + groupName + '/' + resName;
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

Limberest.prototype.updateExpectedResult = function(options, groupName, request, result) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(request.method, request.name, 'yaml');
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.write(result);
  request.expectedLocation = options.localLocation + '/' + groupName + '/' + resName;  
};

Limberest.prototype.discardExpectedResult = function(options, groupName, request) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(request.method, request.name, 'yaml');
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.remove();
  delete request.expectedLocation;
};

Limberest.prototype.saveExpectedResult = function(options, groupName, request, result) { // eslint-disable-line no-unused-vars
  
};

Limberest.prototype.loadRequestActual = function(groupName, method, name, options, callback) {
  var resName = this.getResourceName(method, name, 'yaml');
  var storage = new Storage(new Options(options).options.resultLocation + '/' + groupName, resName);
  callback(null, storage.exists ? storage.read() : null);
};

Limberest.prototype.loadRequestLog = function(groupName, method, name, options, callback) {
  var resName = this.getResourceName(method, name, 'log');
  var storage = new Storage(new Options(options).options.logLocation + '/' + groupName, resName);
  callback(null, storage.exists ? storage.read() : null);
};

Limberest.prototype.loadActual = function(path, resName, options, callback) {
  var resultLoc = new Options(options).options.resultLocation;
  if (path)
    resultLoc += '/' + path;
  var storage = new Storage(resultLoc, resName + '.yaml');
  callback(null, storage.exists ? storage.read() : null);
};

Limberest.prototype.loadLog = function(path, resName, options, callback) {
  var logLoc = new Options(options).options.logLocation;
  if (path)
    logLoc += '/' + path;
  var storage = new Storage(logLoc, resName + '.log');
  callback(null, storage.exists ? storage.read() : null);
};

// abbreviated method for naming
Limberest.prototype.getResourceName = function(method, name, ext) {
  var meth = method;
  if (typeof method === 'object') {
    // actually a request passed
    meth = method.method;
    name = method.name;
    ext = 'request';
  }
  if (meth == 'DELETE')
    meth = 'DEL';
  else if (meth == 'OPTIONS')
    meth = 'OPT';
  return meth + ':' + name + '.' + ext;
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
Limberest.prototype.Logger = Logger;
Limberest.prototype.postman = postman;
Limberest.prototype.compare = compare;
Limberest.prototype.subst = subst;
Limberest.prototype.createGroup = group.create;
module.exports = new Limberest();