'use strict';

// just a data object that loads expected and actual results
const proto = {
  getExpected() {
    return { hello: there };
  },
  getActual() {
    return { not: really };
  }
};

module.exports = {
  create: (test, request) => Object.assign({test: test, request: request}, proto)
};