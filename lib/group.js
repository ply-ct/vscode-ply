'use strict';

const test = require('./test');

const proto = {
  getTest(method, name, options) {
    var t = this.tests.find((test) => {
      return test.name === name && test.request.method === method;
    });
    if (!t)
      throw new Error('Test not found: ' + this.name + ': ' + method + ' ' + name);
    return test.create(this.name, t, options);
  }
};

module.exports = {
  create: (location, from) => {
    return Object.assign({location: location}, proto, from);
  }
};