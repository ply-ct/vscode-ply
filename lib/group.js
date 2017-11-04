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
  }
};

module.exports = {
  create: (location, from) => {
    return Object.assign({location: location}, proto, from);
  }
};