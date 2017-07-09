'use strict';

const async = require('async');

var GitHub = function(ownerRepo) {
  this.url = 'https://api.github.com/repos/' + ownerRepo;
  if (typeof window === 'undefined') {
    this.request = require('request');
  } 
  else {
    this.isBrowser = true;
    this.request = require('browser-request');
  }
}

// TODO: recursiveness and optionally specify ext
GitHub.prototype.getTests = function(path, callback) {
  var ext = '.postman';
  var opts = { url: this.url + '/contents/' + path };
  if (!this.isBrowser)
    opts.headers = { 'User-Agent': 'limberest' };
  var request = this.request;
  request(opts, function(error, response, body) {
    var groupFiles = [];
    JSON.parse(body).forEach(file => {
      if (file.name.endsWith(ext)) {
        groupFiles.push({name: file.name, url: file.download_url});
      }
    });
    var groups = {};
    async.map(groupFiles, function(groupFile, callback) {
      request(groupFile.url, function(error, response, body) {
        var groupObj = JSON.parse(body);
        var group = {name: groupFile.name, tests: []};
        if (groupObj.item) {
          groupObj.item.forEach(itemObj => {
            var test = {name: itemObj.name};
            if (itemObj.request) {
              test.method = itemObj.request.method;
            }
            group.tests.push(test);
          });
        }
        callback(error, group);
      });
    }, function(err, groups) {
      var tests = {};
      groups.forEach(group => {
        tests[group.name] = group.tests;
      });
      callback(err, tests);
    });    
  });
};

GitHub.prototype.toString = function gitHubToString() {
  return this.url;
}

exports.GitHub = GitHub;