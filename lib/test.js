'use strict';

const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const defaults = require('defaults');
const sanitize = require('sanitize-filename');
const diff = require('diff');
const jsYaml = require('js-yaml');
const run = require('./run');
const subst = require('./subst');

const defaultOptions = {
  prettyIndent: 2,
  caseName: path.basename(process.argv[1]),
  caseDir: path.dirname(process.argv[1]),
  resultDir: './test/results',
  logDir: './test/results',
  debug: false,
  overwrite: false
};

const proto = {
  run(values, callback) {
    this.result = null;
    try {
      this.logger.info(this.options.caseName + ' @' + new Date());
      const testRun = run.create(this.name);
      this.logger.info('Running test ' + this.group + ': ' + this.method + ' ' + this.getBaseFileName() + ' (id: ' + testRun.id + ')');
      var req = this.getRequest(values);
      this.logger.debug('Request:\n' + this.jsonString(req));
      
      testRun.execute(req, (resp, error) => {
        if (error)
          handleError(error);
        try {
          if (resp)
            this.logger.debug('Response:\n' + this.jsonString(resp));
          
          // save yaml results
          var actualYaml = this.yamlString(testRun);
          const actualFile = this.options.resultDir + path.sep + this.getBaseFileName() + '.yaml';
          fs.ensureFileSync(actualFile);
          fs.writeFileSync(actualFile, actualYaml);
          
          if (!error) {
            const expectedFile = this.options.caseDir + path.sep + this.getBaseFileName() + '.yaml';
            if (this.options.overwrite) {
              this.logger.info('Creating expected results file: ' + expectedFile);
              fs.ensureFileSync(expectedFile);
              fs.writeFileSync(expectedFile, actualYaml);
            }
            else if (!fs.existsSync(expectedFile)) {
              throw new Error('Expected results file not found: ' + expectedFile);
            }
            
            this.logger.debug('Comparing: ' + expectedFile + '\n  with: ' + actualFile);
            var expectedYaml = fs.readFileSync(expectedFile, 'utf-8');
            console.log("EXPECTED: " + expectedYaml);
            console.log("ACTUAL: " + actualYaml);
            var changes = diff.diffLines(expectedYaml, actualYaml, {newlineIsToken: false, ignoreWhitespace: false});
            if (changes) {
              console.log("CHANGES:");
              changes.forEach(change => {
                console.log(" =>" + JSON.stringify(change));
              });
              
              this.result = { 
                status: 'Failed', 
                message: 'DIFF: ' + changes
              };
            }
            else {
              this.result = {status: 'Passed', message: 'Test succeeded' };
            } 
          }
          
          if (callback)
            callback(resp, this.result, error);
        }
        catch (err) {
          this.handleError(err);
          if (callback)
            callback(resp, this.result, error);
        }
      });
      return testRun;
    }
    catch (e) {
      console.log('STACK: ' + e.stack);
      this.logger.error(e.stack);
      var res = { 
          status: 'Errored', 
          message: e.toString()
      };
      if (callback)
        callback(null, res, e);
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
  },
  jsonString(obj) {
    return JSON.stringify(obj, null, this.options.prettyIndent);
  },
  yamlString(obj) {
    return jsYaml.safeDump(obj, {noCompatMode: true, skipInvalid: true});
  },
  handleError(error) {
    this.logger.error(error.stack);
    this.result = { 
        status: 'Errored', 
        message: error.toString()
    };
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
          humanReadableUnhandledException: true,
          handleExceptions: true
        }),
        new (winston.transports.File)({
          filename: logFile, 
          level: test.options.debug ? 'debug' : 'info',
          json: false,
          humanReadableUnhandledException: true,
          handleExceptions: true,
          formatter: function(options) {
            return options.message ? options.message : '';
          }      
        })
      ]
    });
    
    return test;
  }
};