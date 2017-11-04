'use strict';

const Case = require('./case').Case;
const subst = require('./subst');

const proto = {
  run(options, values, callback) {
    var caseName = options.caseName;
    if (!caseName) {
      caseName = this.name;
      var method = this.method ? this.method : null;
      if (method) {
        if (method == 'DELETE')
          caseName = 'DEL:' + caseName;
        else if (method == 'OPTIONS')
          caseName = 'OPT:' + caseName;
        else
          caseName = method + ':' + caseName;
      }
    }
    this.implicitCase = new Case(caseName, options);
    return this.implicitCase.run(this, values, callback);
  },
  verify: function(values, callback) {
    this.implicitCase.verify(values, (error, result) => {
      this.result = result;
      if (callback)
        callback(error, result);
    });
  },
  verifySync: function(values) {
    this.result = this.implicitCase.verifySync(values);
    return this.result;
  },
  verifyResult: function(expected, values) {
    this.result = this.implicitCase.verifyResult(expected, values);
    return this.result;
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