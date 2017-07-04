'use strict';

const request = require('request');
const run = require('./run');

const proto = {
  run(values) {
    console.log(`running test ${this.name}:`);
    var req = test.getRequest(values);
    const testRun = run.create(this.name, values);
    
  },
  getRequest(values) {
    const req = {
      url: this.subst(test.url),
      method: this.method
    };
    if (this.header) {
      req.header = {};
      Object.keys(this.header).forEach(key => {
        req.header[key] = this.subst(req.header[key]);
      });
    }
    if (this.body) {
      req.body = this.subst(this.body)
    }
    return req;
  },
  subst(instr) {
    return instr;
  }
};

module.exports = {
  create: (group, from) => Object.assign({group: group}, proto, from)
};