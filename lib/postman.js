'use strict';

function Postman() {
}

Postman.prototype.isEnv = function(obj) {
  return obj._postman_variable_scope;
};

Postman.prototype.values = function(envObj) {
  var vals = null;
  if (envObj.values) {
    vals = {};
    envObj.values.forEach(value => {
      if (value.enabled === null || value.enabled) {
        vals[value.key] = value.value;
      }
    });
    return vals;
  }
};

Postman.prototype.isCollection = function(obj) {
  return obj.info && obj.info._postman_id;
};

Postman.prototype.group = function(collectionObj) {
  const group = { name: collectionObj.info.name };
  if (collectionObj.info && collectionObj.info.description)
    group.description = collectionObj.info.description;
  if (collectionObj.item) {
    group.requests = [];
    collectionObj.item.forEach(item => {
      const request = { name: item.name };
      if (item.request) {
        request.method = item.request.method;
        request.url = this.replaceExpressions(item.request.url.raw ? item.request.url.raw : item.request.url);
        if (item.request.description)
          request.description = item.request.description;
        if (item.request.header) {
          request.headers = {};
          item.request.header.forEach(h => {
            request.headers[h.key] = this.replaceExpressions(h.value);
          });
        } 
        if (request.method !== 'GET' && item.request.body && item.request.body.raw) {
          request.body = this.replaceExpressions(item.request.body.raw);
        }
      }
      group.requests.push(request);
    });
  }
  return group;
};

// update a request in the collection
Postman.prototype.setRequest = function(collection, request) {
  const postmanRequest = collection.item.find(postmanReq => {
    if (postmanReq.name === request.name) {
      return postmanReq.request.method === request.method;
    }
    return false;
  });
  if (postmanRequest) {
    postmanRequest.request.url = request.url;
    postmanRequest.request.body = request.body;
    postmanRequest.request.header = [];
    if (request.headers) {
      Object.keys(request.headers).forEach(name => {
        postmanRequest.request.header.push({
          key: name,
          value: request.headers[name]
        });
      });
    }
  }
  else {
    collection.item.push(this.createRequest(request));
  }
};

Postman.prototype.createRequest = function(request) {
  const req = {
    name: request.name,
    request: {
      method: request.method,
      url: request.url,
      body: request.body,
      header: []
    }
  };
  if (request.headers) {
    Object.keys(request.headers).forEach(name => {
      req.request.header.push({
        key: name,
        value: request.headers[name]
      });
    });
  }
  return req;
};

// replace postman placeholders with js template literal expressions
Postman.prototype.replaceExpressions = function(str) {
  return str.replace(/\{\{(.*?)}}/g, function(a, b) {
    return '${' + b + '}'; 
  });
};

module.exports = new Postman();