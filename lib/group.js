'use strict';

const test = require('./test');

const proto = {
  test(name) {
    return test.create(this.name, this.tests.find((test) => {
      return test.name === name;
    }));
  }  
};

module.exports = {
  create: (file, from) => Object.assign({file: file}, proto, from)
};