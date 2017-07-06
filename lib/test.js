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
      var result = implicitCase.verify(values);
      if (callback)
        callback(response, result, error);
    });
  },
  getRequest(values) {
    const req = {
      url: subst.replace(this.url, values),
      method: this.method
    };
    if (this.headers) {
      req.headers = {};
      Object.keys(this.headers).forEach(key => {
        req.headers[key] = subst.replace(this.headers[key], values);
      });
    }
    if (this.body) {
      req.body = subst.replace(this.body, values);
    }
    return req;
  }
};

module.exports = {
  create: (group, from) => Object.assign({group: group}, proto, from)
};