'use strict';

const request = require('./request');

const proto = {
  getRequest(method, name, options) {
    var req = this.requests.find((request) => {
      return request.name === name && request.method === method;
    });
    if (!req)
      throw new Error('Request not found: ' + this.name + ': ' + method + ' ' + name);
    return request.create(this.name, req, options);
  },
  setRequest(request) {
    var idx = this.requests.findIndex(r => {
      return r.name === request.name && r.method === request.method;
    });
    if (idx >= 0)
      this.requests.splice(idx, 1);
    this.requests.push(request);
  }
};

module.exports = {
  create: (location, from) => {
    return Object.assign({location: location}, proto, from);
  }
};