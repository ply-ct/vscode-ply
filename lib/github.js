'use strict';

const async = require('async');

// github ui url
// https://github.com/limberest/limberest-demo
// OR... github api contents
// https://api.github.com/repos/limberest/limberest-demo
var GitHub = function(url, branch) {
  this.url = url;
  if (url.startsWith('https://api.github.com/repos/')) {
    this.path = url.substring(29);
    this.apiUrl = url;
  }
  else if (url.startsWith('https://github.com/')) {
    this.path = url.substring(19);
    this.apiUrl = 'https://api.github.com/repos/' + this.path;
  }
  else {
    throw new Error('Unsupported URL format: ' + url);
  }
  
  this.branch = branch ? branch : 'master';
  
  if (typeof window === 'undefined') {
    this.request = require('request');
    this.requestOptions = {headers: {'User-Agent': 'limberest'}};
  } 
  else {
    this.request = require('browser-request');
    this.requestOptions = {};
  }
};

GitHub.prototype.get = function(file, callback) {
  var url = 'https://raw.githubusercontent.com/' + this.path + '/' + this.branch + '/' + file.path;
  var opts = Object.assign({url: url}, this.requestOptions);
  this.request(opts, function(error, response, body) {
    file.contents = body;
    callback(body);
  });
};

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
        files.push({
          name: file.name,
          path: file.path,
          location: file.download_url,
          origin: file.download_url,
          uiOrigin: file.html_url
        });
      }
    });
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

// callback may pass an error
// TODO: only works in the browser due to fetch()
// TODO: only works for master branch
GitHub.prototype.commitAndPush = function(token, file, message, callback) {
  let ok;
  let masterHeadSha;
  let accessTokenParam = '?access_token=' + token;

  var baseUrl = this.apiUrl;
  if (!baseUrl.endsWith('/'))
    baseUrl += '/';
  baseUrl += 'git';
  
  // GET master HEAD commit
  fetch(baseUrl + '/refs/heads/master')
  .then(response => {
    ok = response.ok;
    return response.json();
  })
  .then(json => {
    if (ok) {
      // GET sha for the tree
      masterHeadSha = json.object.sha;
      return fetch(baseUrl + '/commits/' + masterHeadSha);
    }
    else {
      callback(new Error(JSON.stringify(json)));
    }
  })
  .then(response => {
    ok = response.ok;
    return response.json();
  })
  .then(json => {
    if (ok) {
      // POST new tree
      const newTree = {
          base_tree: json.tree.sha,
          tree: [{
            type: 'blob',
            path: file.path,
            content: file.contents,
            mode: '100644'
          }]
      };
      return fetch(new Request(baseUrl + '/trees' + accessTokenParam), { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(newTree)
      });
    }
    else {
      callback(new Error(JSON.stringify(json)));
    }
  })
  .then(response => {
    ok = response.ok;
    return response.json();
  })
  .then(json => {
    if (ok) {
      // POST commit
      const newCommit = {
        tree: json.sha,
        message: message,
        parents: [ masterHeadSha ]
      };
      return fetch(new Request(baseUrl + '/commits' + accessTokenParam), { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(newCommit)
      });
    }
    else {
      callback(new Error(JSON.stringify(json)));
    }
  })
  .then(response => {
    ok = response.ok;
    return response.json();
  })
  .then(json => {
    if (ok) {
      // PATCH branch to point to new commit
      return fetch(new Request(baseUrl + '/refs/heads/master' + accessTokenParam), { 
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ sha: json.sha})
      });
    }
    else {
      callback(new Error(JSON.stringify(json)));
    }
  })
  .then(response => {
    ok = response.ok;
    return response.json();
  })
  .then(json => {
    if (ok) {
      file.origin = 'https://raw.githubusercontent.com/' + this.path + '/' + this.branch + '/' + file.path;
      file.uiOrigin = 'https://github.com/' + this.path + '/blob/' + this.branch + '/' + file.path;
      callback()
    }
    else {
      callback(new Error(JSON.stringify(json)));
    }
  });
};

GitHub.prototype.toString = function gitHubToString() {
  return this.apiUrl;
};

exports.GitHub = GitHub;