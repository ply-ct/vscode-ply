'use strict';

var codes = require('builtin-status-codes');

const proto = {
    
  execute(req) {
    this.request = req;
    this.response = null;
    var run = this;

    var request;
    if (typeof window === 'undefined') {
      request = require('request');
    } 
    else {
      request = require('browser-request');
    }

    return new Promise(function(resolve, reject) {
      const before = new Date().getTime();
      request({
        url: run.request.url,
        method: run.request.method,
        headers: run.request.headers,
        body: run.request.body,
        time: true
      }, function(error, response, body) {
        if (response) {
          const elapsed = new Date().getTime() - before;
          var responseHeaders;
          if (typeof window === 'undefined')
            responseHeaders = response.headers;
          else
            responseHeaders = run.parseResponseHeaders(response);
          run.response = {
              status: {
                code: response.statusCode,
                message: response.statusMessage
              },
              time: response.elapsedTime ? response.elapsedTime : elapsed,
              headers: responseHeaders,
              body: body ? body : response.body
          };
          if (run.response.status.code > 0 && !run.response.status.message)
            run.response.status.message = codes[run.response.status.code];
        }
        if (error) {
          reject(error);
        }
        else {
          resolve(run.response);
        }
      });    
    });
  },
  // TODO key ordering
  prettify(indent) {
    var pretty = { test: this.test };
    if (this.request) {
      pretty.request = {};
      pretty.request.url = this.request.url;
      pretty.request.method = this.request.method;
      pretty.request.headers = this.request.headers;
      if (this.request.body) {
        try {
          pretty.request.body = JSON.stringify(JSON.parse(this.request.body), null, indent);
        }
        catch (err) { 
          console.log(err);
        }
      }
    }
    if (this.response) {
      pretty.response = {};
      pretty.response.status = this.response.status;
      pretty.response.headers = this.response.headers;
      if (this.response.body) {
        try {
          pretty.response.body = JSON.stringify(JSON.parse(this.response.body), null, indent);
        }
        catch (err) { 
          console.log(err);
        }
      }
    }
    pretty.response.time = this.response.time;
    return pretty;
  },
  parseResponseHeaders(xhrResponse) {
    var headerStr = xhrResponse.getAllResponseHeaders();
    var headers = {};
    if (headerStr) {
      var headerPairs = headerStr.split('\u000d\u000a');
      for (var i = 0, len = headerPairs.length; i < len; i++) {
        var headerPair = headerPairs[i];
        var index = headerPair.indexOf('\u003a\u0020');
        if (index > 0) {
          var key = headerPair.substring(0, index).toLowerCase();
          var val = headerPair.substring(index + 2);
          headers[key] = val;
        }
      }
    }
    return headers;    
  }
};


module.exports = {
  create: (test) => Object.assign({test: test}, proto)
};