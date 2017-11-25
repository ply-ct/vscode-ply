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
    postmanRequest.request.header = this.createHeader(request);
    postmanRequest.request.body = this.createBody(request);
    postmanRequest.request.url = this.createUrl(request);
  }
  else {
    collection.item.push(this.createRequest(request));
  }
};

Postman.prototype.createRequest = function(request) {
  const req = {
    name: request.name,
    request: {
      method: request.method
    }
  };
  req.header = this.createHeader(request);
  req.body = this.createBody(request);
  req.url = this.createUrl(request);
  return req;
};

Postman.prototype.createUrl = function(request) {
  const url = {};
  if (request.url) {
    url.raw = this.replaceLiterals(request.url);
    if (url.raw.startsWith('http://'))
      url.protocol = 'http';
    else if (url.raw.startsWith('https://'))
      url.protocol = 'https';
  
    const rem = url.protocol ? url.raw.substring(url.protocol.length + 3) : url.raw;
    const segs = rem.split('/');
    const colon = segs[0].indexOf(':');
    if (colon > 0) {
      url.host = segs[0].substring(0, colon).split('.');
      url.port = segs[0].substring(colon + 1);
    }
    else {
      url.host = segs[0].split('.');
    }
    segs.splice(0, 1);
    // console.log("SEGS: " + segs);
    if (segs.length) {
      url.path = segs;
      const q = segs[segs.length - 1].lastIndexOf('?');
      if (q > 0) {
        url.query = [];
        const query = segs[segs.length - 1].substring(q + 1);
        var search = /([^&=]+)=?([^&]*)/g;
        var match;
        while ((match = search.exec(query)) !== null) {
          url.query.push({
            key: match[1],
            value: match[2] ? match[2] : '',
            equals: match[2] ? true : false
          });
        }
        segs[segs.length - 1] = segs[segs.length - 1].substring(0, q);
      }
    }
  }  
  return url;
};

Postman.prototype.createHeader = function(request) {
  let header = [];
  if (request.headers) {
    Object.keys(request.headers).forEach(name => {
      header.push({
        key: name,
        value: this.replaceLiterals(request.headers[name])
      });
    }, this);
  }
  return header;
};

Postman.prototype.createBody = function(request) {
  let body = {
    mode: 'raw',
    raw: ''
  };
  if (request.body)
    body.raw = this.replaceLiterals(request.body);
  return body;
};

// replace postman placeholders with js template literal expressions
Postman.prototype.replaceExpressions = function(str) {
  return str.replace(/\{\{(.*?)}}/g, function(a, b) {
    return '${' + b + '}'; 
  });
};
// replace js template literals with postman placeholders
Postman.prototype.replaceLiterals = function(str) {
  return str.replace(/\$\{(.*?)}/g, function(a, b) {
    return '{{' + b + '}}';
  });
};

module.exports = new Postman();