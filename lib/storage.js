'use strict';

const fs = require('fs');

// Abstracts storage to file system or html5 localStorage.
// name is optional
var Storage = function(location, name) {
  this.location = location;
  this.name = name;
  if (typeof localStorage === 'undefined' || localStorage === null) {
    if (this.name) {
      this.name = require('sanitize-filename')(this.name, {replacement: '_'});
      require('mkdirp').sync(this.location);
    }
  }
  else {
    this.localStorage = localStorage;
  }
  this.path = this.location;
  if (this.name)
    this.path += '/' + this.name;
};

Storage.prototype.read = function(callback) {
  if (this.localStorage) {
    return this.localStorage.getItem(this.path);
  }
  else {
    var contents = null;
    if (fs.existsSync(this.path)) {
      if (callback) {
        fs.readFile(this.path, 'utf-8', callback);
      }
      else {
        contents = fs.readFileSync(this.path, 'utf-8');
      }
    }
    else {
      if (callback)
        callback(new Error('Not found: ' + this));
    }
    return contents;
  }
};

Storage.prototype.append = function(value) {
  if (this.localStorage) {
    var exist = this.localStorage.getItem(this.path);
    var appended = exist ? exist + value : value;
    this.localStorage.setItem(this.path, appended);
  }
  else {
    fs.appendFileSync(this.path, value);
  }
};

Storage.prototype.write = function(value) {
  if (this.localStorage) {
    localStorage.setItem(this.path, value);
  }
  else {
    fs.writeFileSync(this.path, value);
  }
};

Storage.prototype.remove = function() {
  if (this.localStorage) {
    this.localStorage.removeItem(this.path);
  }
  else {
    if (fs.existsSync(this.path))
      fs.unlinkSync(this.path);
  }
};

Storage.prototype.exists = function() {
  if (this.localStorage) {
    return this.localStorage.getItem(this.path) !== null;
  }
  else {
    return fs.existsSync(this.path);
  }
};

// TODO: option for recursive
Storage.prototype.getMatches = function(options, callback) {
  if (this.localStorage) {
    var items = [];
    for (let i = 0; i < this.localStorage.length; i++) {
      var key = this.localStorage.key(i);
      var matchingExt = options.extensions.find(ext => {
        return key.startsWith(this.location + '/' + options.path) && key.endsWith(ext);
      });
      if (matchingExt) {
        items.push({
          name: key,
          origin: this.location + '/' + key,
          location: this.location,
          contents: this.localStorage.getItem(key)
        });
      }      
    }    
  }
  else {
    var dirLoc = this.location;
    if (options.path)
      dirLoc += '/' + options.path;
    fs.readdir(dirLoc, function(err, names) {
      var files = [];
      names.forEach(name => {
        var matchingExt = options.extensions.find(ext => {
          return name.endsWith(ext);
        });
        if (matchingExt) {
          var loc = dirLoc + '/' + name;
          files.push({
            name: name,
            origin: loc,
            location: loc,
            contents: fs.readFileSync(loc, 'utf-8')
          });
        }
      });
      callback(err, files);
    });    
  }
};


Storage.prototype.toString = function storageToString() {
  return this.path;
};

exports.Storage = Storage;