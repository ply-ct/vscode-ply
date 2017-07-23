'use strict';

const async = require('async');

// github ui url
// https://github.com/limberest/limberest-demo
// OR... github api contents
// https://api.github.com/repos/limberest/limberest-demo
var GitHub = function(url, branch) {
  this.url = url;
  if (url.startsWith('https://api.github.com/repos/')) {
    this.apiUrl = url;
  }
  else if (url.startsWith('https://github.com/')) {
    var path = url.substring(19);
    this.apiUrl = 'https://api.github.com/repos/' + path;
  }
  else {
    throw new Error('Unsupported URL format: ' + url);
  }
  
  this.branch = branch;
  
  if (typeof window === 'undefined') {
    this.request = require('request');
    this.requestOptions = {headers: {'User-Agent': 'limberest'}};
  } 
  else {
    this.request = require('browser-request');
    this.requestOptions = {};
  }
}

// TODO: option for recursiveness
GitHub.prototype.getMatches = function(options, callback) {
  var opts = Object.assign({url: this.apiUrl + '/contents/' + options.path}, this.requestOptions);
  if (this.branch && this.branch != 'master')
    opts.url += '?ref=' + this.branch;
  var request = this.request;
  request(opts, function(error, response, body) {
    var files = [];
    JSON.parse(body).forEach(file => {
      var matchingExt = options.extensions.find(ext => {
        return file.name.endsWith(ext);
      });
      if (matchingExt) {
        files.push({name: file.name, location: file.download_url});
      }
    });
    var matches = [];
    async.map(files, function(file, callback) {
      request(file.location, function(error, response, body) {
        file.contents = body;
        callback(error, file);
      });
    }, function(err, files) {
      callback(err, files);
    });    
  });
};

GitHub.prototype.toString = function gitHubToString() {
  return this.apiUrl;
}

exports.GitHub = GitHub;