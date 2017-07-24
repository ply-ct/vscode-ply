'use strict';

function Postman() {
}

Postman.prototype.isEnv = function(obj) {
  return obj._postman_variable_scope;
};

Postman.prototype.env = function(obj) {
  var env = null;
  if (obj.values) {
    env = {};
    obj.values.forEach(value => {
      if (value.enabled == null || value.enabled) {
        env[value.key] = value.value;
      }
    });
    return env;
  }
};

Postman.prototype.isGroup = function(obj) {
  return obj.info && obj.info._postman_id;
}

Postman.prototype.group = function(obj) {
  const group = { name: obj.info.name };
  if (obj.info && obj.info.description)
    group.description = obj.info.description;
  if (obj.item) {
    group.tests = [];
    obj.item.forEach(item => {
      const test = { name: item.name };
      if (item.request) {
        test.request = {};
        test.request.method = item.request.method;
        test.request.url = this.replaceExpressions(item.request.url.raw ? item.request.url.raw : item.request.url);
        if (item.request.description)
          test.request.description = item.request.description;
        if (item.request.header) {
          test.request.headers = {};
          item.request.header.forEach(h => {
            test.request.headers[h.key] = this.replaceExpressions(h.value);
          });
        } 
        if (test.request.method !== 'GET' && item.request.body && item.request.body.raw) {
          test.request.body = this.replaceExpressions(item.request.body.raw);
        }
      }
      group.tests.push(test);
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