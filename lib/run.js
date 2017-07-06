'use strict';

const request = require('request');

const proto = {
    
  // returns the response
  execute(req, callback) {
    this.request = req;
    this.response = null;
    var run = this;
    
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
            body: body
        };
      }
      if (callback)
        callback(run.response, error);
    });    
  }
};

module.exports = {
  create: (test) => Object.assign({test: test}, proto)
};