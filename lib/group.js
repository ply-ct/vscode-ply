'use strict';

const test = require('./test');

const proto = {
  test(method, name, options) {
    var t = this.tests.find((test) => {
      return test.name === name && test.method === method;
    });
    if (!t)
      throw new Error('Test not found: ' + this.name + ': ' + method + ' ' + name);
    return test.create(this.name, t, options);
  }  
};

module.exports = {
  create: (file, from) => Object.assign({file: file}, proto, from)
};