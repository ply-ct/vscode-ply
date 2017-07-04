'use strict';

const test = require('./test');

const proto = {
  test(name, method) {
    const m = method ? method.toUpperCase() : 'GET';
    var t = this.tests.find((test) => {
      return test.name === name && test.method === m;
    });
    if (!t)
      throw new Error('Test not found: ' + this.name + ': ' + m + ' ' + name);
    return test.create(this.name, t);
  }  
};

module.exports = {
  create: (file, from) => Object.assign({file: file}, proto, from)
};