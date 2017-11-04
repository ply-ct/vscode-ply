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
}

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

// replace postman placeholders with js template literal expressions
Postman.prototype.replaceExpressions = function(str) {
  return str.replace(/\{\{(.*?)}}/g, function(a, b) {
    return '${' + b + '}'; 
  });
};

module.exports = new Postman();