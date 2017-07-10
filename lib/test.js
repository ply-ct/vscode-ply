'use strict';

const testCase = require('./case');
const subst = require('./subst');

const proto = {
  run(options, values, callback) {
    var caseName = this.name;
    var method = this.request ? this.request.method : null;
    if (method) {
      if (method == 'DELETE')
        caseName = 'DEL_' + caseName;
      else if (method == 'OPTIONS')
        caseName = 'OPT_' + caseName;
      else
        caseName = method + '_' + caseName;
    }
    this.implicitCase = new (testCase.Case)(caseName, options);
    return this.implicitCase.run(this, values, callback);
  },
  verify: function(values) {
    try {
      this.result = this.implicitCase.verify(values);
    }
    catch (e) {
      if (e instanceof testCase.NoExpectedResult)
        this.result = {status: 'Errored', message: e.message};
      else
        throw e;
    }
    return this.result;
  },
  getRequest(values) {
    const req = {
      url: subst.replace(this.request.url, values),
      method: this.request.method
    };
    if (this.request.headers) {
      req.headers = {};
      Object.keys(this.request.headers).forEach(key => {
        req.headers[key] = subst.replace(this.request.headers[key], values);
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