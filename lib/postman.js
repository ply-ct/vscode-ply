'use strict';

function Postman() {
}

Postman.prototype.isEnv = function(obj) {
  return obj._postman_variable_scope;
};

Postman.prototype.env = function(obj) {
  if (obj.values) {
    const env = {};
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
  if (obj.item) {
    group.tests = [];
    obj.item.forEach(item => {
      const test = { name: item.name };
      if (item.request) {
        test.method = item.request.method;
        test.url = this.replaceExpressions(item.request.url.raw ? item.request.url.raw : item.request.url);
        if (item.request.header) {
          test.headers = {};
          item.request.header.forEach(h => {
            test.headers[h.key] = this.replaceExpressions(h.value);
          });
        } 
        if (test.method !== 'GET' && item.request.body && item.request.body.raw) {
          test.body = this.replaceExpressions(item.request.body.raw);
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