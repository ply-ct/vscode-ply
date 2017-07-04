'use strict';

const request = require('request');
const jsYaml = require('js-yaml');
const run = require('./run');
const subst = require('./subst');

const proto = {
  run(values) {
    console.log(`running test ${this.name}:`);
    var req = this.getRequest(values);
    
    // save request yaml
    var reqYaml = jsYaml.safeDump(req, {noCompatMode: true});
    console.log('REQUEST YAML:\n' + reqYaml);
    
    // const testRun = run.create(this.name, values);
    
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