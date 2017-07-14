'use strict';

var codes = require('builtin-status-codes');

const proto = {
    
  // returns the response
  execute(req, callback) {
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

    request({
      url: this.request.url,
      method: this.request.method,
      headers: this.request.headers,
      body: this.request.body,
      time: true
    }, function(error, response, body) {
      if (response) {
        run.response = {
            status: {
              code: response.statusCode,
              message: response.statusMessage
            },
            time: response.elapsedTime,
            headers: response.headers,
            body: body ? body : response.body
        };
        if (run.response.status.code > 0 && !run.response.status.message)
          run.response.status.message = codes[run.response.status.code];
      }
      if (callback)
        callback(run.response, error);
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
        catch (e) { }
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
        catch (e) { }
      }
    }
    pretty.response.time = this.response.time;
    return pretty;
  }
};


module.exports = {
  create: (test) => Object.assign({test: test}, proto)
};