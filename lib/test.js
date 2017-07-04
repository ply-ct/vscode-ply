'use strict';

const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const defaults = require('defaults');
const sanitize = require('sanitize-filename');
const run = require('./run');
const subst = require('./subst');

const defaultOptions = {
  prettyIndent: 2,
  caseName: path.basename(process.argv[1]),
  caseDir: './test/cases',
  resultDir: './test/results',
  logDir: './test/results',
  debug: false
};

const proto = {
  run(values, callback) {
    
    try {
      this.logger.info(this.options.caseName + ' @' + new Date());
      const testRun = run.create(this.name);
      this.logger.info('Running test ' + this.group + ': ' + this.method + ' ' + this.getBaseFileName() + ' (id: ' + testRun.id + ')');
      var req = this.getRequest(values);
      
      testRun.execute(req, (resp, res, error) => {
        if (error)
          this.logger.error(error.stack);
        // save yaml results
        if (callback)
          callback(resp, res);
      });
      return testRun;
    }
    catch (e) {
      this.logger.error(e.stack);
    }
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
  },
  getBaseFileName() {
    var name = this.options.caseName;
    var lastDot = name.lastIndexOf('.');
    if (lastDot > 0)
      name = name.substring(0, lastDot);
    return sanitize(name, {replacement: '_'});
  }
};

module.exports = {
  create: (group, from, options) => {
    var test = Object.assign({group: group}, proto, from);
    test.options = defaults(options, defaultOptions);

    // TODO logger options
    fs.mkdirsSync(test.options.logDir);
    const logFile = test.options.logDir + '/' + test.getBaseFileName() + '.log';
    if (fs.existsSync(logFile))
      fs.unlinkSync(logFile);
    test.logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({
          level: test.options.debug ? 'debug' : 'info',
          colorize: true,
//          humanReadableUnhandledException: true,
//          handleExceptions: true
        }),
        new (winston.transports.File)({
          filename: logFile, 
          // level: test.options.debug ? 'debug' : 'info',
          json: false,
//          humanReadableUnhandledException: true,
//          handleExceptions: true,
          formatter: function(options) {
            return options.message ? options.message : '';
          }      
        })
      ]
    });
    
    fs.mkdirsSync(test.options.resultDir);
    const resultFile = test.options.logDir + '/' + test.getBaseFileName() + '.yaml';
    if (fs.existsSync(resultFile))
      fs.unlinkSync(resultFile);
    test.resultLogger = new (winston.Logger)({
      transports: [
        new (winston.transports.File)({
          filename: resultFile, 
          json: false,
          formatter: function(options) {
            return options.message ? options.message : '';
          }      
        })
      ]
    });

    return test;
  }
};