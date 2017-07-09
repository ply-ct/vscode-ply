'use strict';

const testCase = require('./case');
const subst = require('./subst');

const proto = {
  run(values, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = testCases.defaultOptions;
    }
    var implicitCase = new (testCase.Case)(this.name, options);
    return implicitCase.run(this, values, (response, error) => {
      var result;
      try {
          result = implicitCase.verify(values);
      }
      catch (e) {
        if (e instanceof testCase.NoExpectedResult)
          result = {status: 'Errored', message: e.message};
        else
          throw e;
      }
      if (callback)
        callback(response, result, error);
    });
  },
  getRequest(values) {
    const req = {
      url: subst.replace(this.request.url, values),
      method: this.request.method
    };
    if (this.headers) {
      req.headers = {};
      Object.keys(this.request.headers).forEach(key => {
        req.headers[key] = subst.replace(this.headers[key], values);
      });
    }
    if (this.body) {
      req.body = subst.replace(this.request.body, values);
    }
    return req;
  }
};

module.exports = {
  create: (group, from) => Object.assign({group: group}, proto, from)
};