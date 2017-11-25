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

Limberest.prototype.loadValues = function(options, paths) {
  return new Promise(function(resolve, reject) {
    const async = require('async');
    var vals = {};
    async.map(paths, function(path, callback) {
      var loc = options.location + '/' + path;
      new Retrieval(loc).load(function(err, data) {
        if (err) {
          reject(err);
        }
        else {
          try {
            var obj = JSON.parse(data);
            obj = postman.isEnv(obj) ? postman.values(obj) : obj;
            vals = Object.assign(vals, obj);
          }
          catch (e) {
            reject(e);
          }
        }
        resolve(vals);
      });
    }, function(err) {
      if (err) {
        reject(err);
      }
      else {
        resolve(vals);
      }
    });
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

Limberest.prototype.fileHasLocal = function(options, path) {
  if (options.localLocation) {
    var localLoc = options.localLocation;
    if (options.qualifier)
      localLoc += '/' + options.qualifier;
    return new Storage(localLoc + '/' + path).exists();
  }
}

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
  // remove from local-only (newly-added file)
  var localFiles = [];
  var storage = new Storage(options.localLocation + '/' + options.path);
  if (storage.exists()) {
    localFiles = JSON.parse(storage.read());
    var idx = localFiles.findIndex(localFile => {
      return localFile.path === file.path;
    });
    if (idx >= 0) {
      localFiles.splice(idx, 1);
      storage.write(JSON.stringify(localFiles));
    }
  }
};

// Creates in local storage.  Does not save to origin.
Limberest.prototype.createFile = function(options, file) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  file.contents = '';
  file.location = options.localLocation + '/' + file.path;
  // add to local-only files
  var localFiles = [];
  var storage = new Storage(options.localLocation + '/' + options.path);
  if (storage.exists()) {
    localFiles = JSON.parse(storage.read());
  }
  localFiles.push(file);
  storage.write(JSON.stringify(localFiles));
};

// Saves from local storage to origin.
Limberest.prototype.saveFile = function(options, token, file, message, callback) {
  const github = new GitHub(options.location);
  github.commitAndPush(token, file, message, callback);
};

Limberest.prototype.updateRequest = function(options, groupName, request) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(request);
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.write(JSON.stringify(request));
  request.location = options.localLocation + '/' + groupName + '/' + resName;  
};

Limberest.prototype.discardRequest = function(options, groupName, request) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(request);
  var storage = new Storage(options.localLocation + '/' + groupName, resName);
  storage.remove();
  delete request.location;
  
  // remove from local-only (newly-added request)
  var grpStore = new Storage(options.localLocation + '/' + groupName);
  if (grpStore.exists()) {
    var localRequests = JSON.parse(grpStore.read());
    var idx = localRequests.findIndex(localRequest => {
      return localRequest.method === request.method && localRequest.name === request.name;
    });
    if (idx >= 0) {
      localRequests.splice(idx, 1);
      grpStore.write(JSON.stringify(localRequests));
    }
  }
};

// Creates in local storage.  Does not save to origin.
Limberest.prototype.createRequest = function(options, groupName, request) {
  if (!options.localLocation)
    throw new Error('No localLocation specified in options');
  var resName = this.getResourceName(request);
  request.url = '';
  request.header = {};
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    request.body = '';
  }
  request.expected = '';
  request.location = options.localLocation + '/' + groupName + '/' + resName;
  // add to local-only requests
  var localRequests = [];
  var storage = new Storage(options.localLocation + '/' + groupName);
  if (storage.exists()) {
    localRequests = JSON.parse(storage.read());
  }
  localRequests.push(request);
  storage.write(JSON.stringify(localRequests));
};

// Merges this request into group, and pushes to origin.
Limberest.prototype.saveRequest = function(options, token, groupName, request, message, callback) {
  const github = new GitHub(options.location);
  var path = options.path + '/' + groupName + options.extensions[0]; // TODO
  github.get({path: path}, contents => {
    const obj = JSON.parse(contents);
    if (postman.isCollection(obj)) {
      postman.setRequest(obj, request);
    }
    else {
      obj = group.create(options.location + '/' + path, obj);
      obj.setRequest(request);
    }
    github.commitAndPush(token, {path: path, contents: JSON.stringify(obj, null, 2)}, message, err => {
      if (!err) {
        delete request.location;
        delete request._local;
      }
      callback(err);
    });
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
Limberest.prototype.loadGroup = function(location) {
  return new Promise(function(resolve, reject) {
    new Retrieval(location).load(function(err, data) {
      if (err) {
        reject(err);
      }
      else {
        if (!err) {
          try {
            const obj = JSON.parse(data);
            if (postman.isCollection(obj)) {
              resolve(group.create(location, postman.group(obj)));
            }
            else {
              resolve(group.create(location, obj));
            }
          }
          catch (e) {
            reject(e);
          }
        }
      }
    });  
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
    var groups = [];
    matches.forEach(match => {
      var obj = JSON.parse(match.contents);
      let grp;
      if (postman.isCollection(obj)) {
        grp = group.create(match.location, postman.group(obj));
        grp.postmanObj = obj;
      }
      else {
        grp = group.create(match.location, obj);
      }

      grp.origin = match.origin;
      grp.uiOrigin = match.uiOrigin;
      
      limbThis.syncGroup(options, grp);
      groups.push(grp);
    });
    callback(err, groups);
  });    
};

// Builds group requests (including expected results), merging from local storage.
Limberest.prototype.constructGroup = function(options, group) {
  if (options.localLocation) {
    // find local-only requests
    var grpStore = new Storage(options.localLocation + '/' + group.name);
    if (grpStore.exists()) {
      JSON.parse(grpStore.read()).forEach(localRequest => {
        localRequest._local = true;
        group.requests.push(localRequest);
      });
    }

    // merge from local (individual tests)
    group.requests.forEach(request => {
      var storage = new Storage(options.localLocation + '/' + group.name, this.getResourceName(request));
      if (storage.exists()) {
        var requestStr = storage.read();
        if (requestStr) {
          var localRequest = JSON.parse(requestStr);
          request.method = localRequest.method;
          request.url = localRequest.url;
          request.headers = localRequest.headers;
          request.body = localRequest.body;
          request.location = storage.path;
        }
      }
      storage = new Storage(options.localLocation + '/' + group.name, 
          this.getResourceName(request.method, request.name, 'yaml'));
      if (storage.exists())
        request.expectedLocation = storage.path;  // indicate exp res overridden
    });
  }
};

// Reconstructs group from current request contents.
// Calls this.constructGroup to build from merged local storage.
Limberest.prototype.syncGroup = function(options, group) {
  this.constructGroup(options, group);
  const fileName = group.name + options.extensions[0]; // TODO
  group.file = {
      name: fileName,
      path: options.path + '/' + fileName,
      origin: group.origin
  }
  group.requests.forEach(request => {
    if (group.postmanObj) {
      postman.setRequest(group.postmanObj, request);
      // postman uses tabs
      group.file.contents = JSON.stringify(group.postmanObj, null, '\t');
    }
    else {
      group.setRequest(request);
      group.file.contents = JSON.stringify(group, null, 2);
    }
  });
};

Limberest.prototype.loadExpected = function(options, groupName, request, callback) {
  options = new Options(options).options;
  var resName = this.getResourceName(request.method, request.name, 'yaml');
  // TODO: populating origin/uiOrigin on incoming request is bad form, and should be in github.js
  request.origin = options.location + '/' + options.path + '/' + groupName + options.extensions[0]; // TODO
  request.expectedName = require('sanitize-filename')(resName, {replacement: '_'});
  request.expectedPath = options.resultPath + '/' + groupName + '/' + request.expectedName;
  if (options.location.startsWith('https://github.com') || request.origin.startsWith('https://raw.githubusercontent.com')) {
    request.expectedOrigin = options.expectedResultLocation + '/' + groupName + '/' + request.expectedName;
    request.expectedUiOrigin = options.location + '/blob/' + options.branch + '/' + request.expectedPath;
  }
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

Limberest.prototype.saveExpectedResult = function(options, token, groupName, request, result, message, callback) {
  const github = new GitHub(options.location);
  var path = options.resultPath + '/' + groupName + '/';
  path += require('sanitize-filename')(this.getResourceName(request.method, request.name, 'yaml'), {replacement: '_'});
  github.commitAndPush(token, {path: path, contents: result}, message, callback);
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