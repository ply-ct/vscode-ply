'use strict';

const request = require('request');

const proto = {
    
  // returns the response
  execute(req, callback) {
    this.request = req;
    this.response = null;
    this.result = null;
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
      if (error) {
        console.log('error:', error);
        run.result = { 
            status: 'Errored', 
            message: error.toString()
        };
      }
      else {
        // TODO set actual result (request and response) YAML
        console.log('body:', body); 
        run.result = { 
          status: 'Passed', 
          message: 'Test succeeded'
        };
      }
      if (callback)
        callback(this.response);
    });    
  },
  getExpected() {
    return { hello: there };
  },
  getActual() {
    return { not: really };
  }
};

module.exports = {
  create: (test) => Object.assign({test: test, id: new Date().toISOString()}, proto)
};