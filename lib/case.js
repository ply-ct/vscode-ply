'use strict';

const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const defaults = require('defaults');
const sanitize = require('sanitize-filename');
const jsYaml = require('js-yaml');
const run = require('./run');
const compare = require('./compare');

const defaultOptions = {
  prettyIndent: 2,
  caseDir: path.dirname(process.argv[1]),
  resultDir: './test/results',
  logDir: './test/results',
  debug: false,
  overwrite: false
};

var Case = exports.Case = function(name, options) {
  if (typeof name === 'object') {
    options = name;
    name = path.basename(process.argv[1], path.extname(process.argv[1]));
  }
  this.name = name;
  this.options = defaults(options, defaultOptions);
  var baseName = this.getBaseFileName();
  
  fs.mkdirsSync(this.options.resultDir);
  const resultFile = this.getActualResultFile();
  if (fs.existsSync(resultFile))
    fs.unlinkSync(resultFile);

  if (this.options.overwrite) {
    const expectedFile = this.getExpectedResultFile();
    if (fs.existsSync(expectedFile))
      fs.unlinkSync(expectedFile);
  }
  
  // TODO logger options (or pass)
  fs.mkdirsSync(this.options.logDir);
  const logFile = this.options.logDir + path.sep + baseName + '.log';
  if (fs.existsSync(logFile))
    fs.unlinkSync(logFile);
  this.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        level: this.options.debug ? 'debug' : 'info',
        colorize: true,
        humanReadableUnhandledException: true,
        handleExceptions: true
      }),
      new (winston.transports.File)({
        filename: logFile, 
        level: this.options.debug ? 'debug' : 'info',
        json: false,
        humanReadableUnhandledException: true,
        handleExceptions: true,
        formatter: function(options) {
          return options.message ? options.message : '';
        }
      })
    ]
  });
};

Case.prototype.run = function(test, values, callback) {
  if (typeof values === 'function') {
    callback = values;
    values = null;
  }  
  
  this.result = null;
  try {
    this.logger.info(this.name + ' @' + new Date());
    const testRun = run.create(this.name);
    this.logger.info('Running test ' + test.group + ': ' + test.method + ' ' + test.name);
    
    if (values)
      this.logger.debug('Values: ' + this.jsonString(values));
    
    var req = test.getRequest(values);
    this.logger.debug('Request: ' + this.jsonString(req));
    
    testRun.execute(req, (resp, error) => {
      if (error)
        this.handleError(error);
      try {
        if (resp)
          this.logger.debug('Response: ' + this.jsonString(resp));
        
        // save yaml results
        var actualYaml = this.yamlString(testRun);
        const actualFile = this.getActualResultFile();
        fs.appendFileSync(actualFile, actualYaml);
        
        if (!error) {
          const expectedFile = this.getExpectedResultFile();
          if (this.options.overwrite) {
            this.logger.info('Writing to expected results file: ' + expectedFile);
            fs.ensureFileSync(expectedFile);
            fs.appendFileSync(expectedFile, actualYaml);
          }
          else if (!fs.existsSync(expectedFile)) {
            throw new Error('Expected results file not found: ' + expectedFile);
          }
        }
        
        if (callback)
          callback(resp, error);
      }
      catch (err) {
        this.handleError(err);
        if (callback)
          callback(resp, error);
      }
    });
    return testRun;
  }
  catch (e) {
    this.logger.error(e.stack);
    var res = { 
        status: 'Errored', 
        message: e.toString()
    };
    if (callback)
      callback(null, res, e);
  }
};

Case.prototype.verify = function(values) {
  var expectedFile = this.getExpectedResultFile();
  if (!fs.existsSync(expectedFile))
    throw new Error('Expected result file not found: ' + expectedFile);
  var actualFile = this.getActualResultFile();
  if (!fs.existsSync(actualFile))
    throw new Error('Result file not found: ' + expectedFile);
  this.logger.debug('Comparing: ' + expectedFile + '\n  with: ' + actualFile);
  var expectedYaml = fs.readFileSync(expectedFile, 'utf-8');
  var actualYaml = fs.readFileSync(actualFile, 'utf-8');
  //var diffs = compare.diffLines(expectedYaml, actualYaml, values, {newlineIsToken: false, ignoreWhitespace: false});
  var diffs = require('diff').diffLines(expectedYaml, actualYaml, values, {newlineIsToken: false, ignoreWhitespace: false});
  var firstDiffLine = 0;
  var diffsMsg = '';
  if (diffs) {
    let line = 1;
    var lineInfo = null;
    for (let i = 0; i < diffs.length; i++) {
      var diff = diffs[i];
      var correspondingAdd = diff.removed && i < diffs.length - 1 && diffs[i + 1].added ? diffs[i + 1] : null;      
      console.log("DIFF: " + JSON.stringify(diff));
      if ((diff.added || diff.removed) && !diff.ignored) {
        var info = line + (diff.count > 1 ? ',' + (line + diff.count - 1) : '');
        if (info !== lineInfo)
          diffsMsg += info + '\n';
        else
          diffsMsg += '---\n';
        lineInfo = info;
        var arrow = diff.added ? '<' : '>'
        diffsMsg += arrow + diff.value.replace('\\n', '\n' + arrow);
      }
      if (correspondingAdd)
        line += diff.count - correspondingAdd.count;
      else
        line += diff.count;
      if (!firstDiffLine && !diff.ignored && (diff.removed || diff.added)) {
        firstDiffLine = line;
      }
    };
  }
  if (firstDiffLine > 0) {
    this.logger.error('Case "' + this.name + '" FAILED: Results differ from line ' + firstDiffLine + ':\n' + diffsMsg);
    return {status: 'Failed', message: 'Results differ from line ' + firstDiffLine};
  }
  else {
    this.logger.info('Case "' + this.name + '" PASSED');
    return {status: 'Passed', message: 'Test succeeded'};
  }
};

Case.prototype.handleError = function(error) {
  this.logger.error(error.stack);
  this.result = { 
      status: 'Errored', 
      message: error.toString()
  };
};

Case.prototype.getBaseFileName = function() {
  return sanitize(this.name, {replacement: '_'});
};

Case.prototype.getActualResultFile = function() {
  return this.options.resultDir + path.sep + this.getBaseFileName() + '.yaml';
}

Case.prototype.getExpectedResultFile = function() {
  return this.options.caseDir + path.sep + this.getBaseFileName() + '.yaml'
}

Case.prototype.jsonString = function(obj) {
  return JSON.stringify(obj, null, this.options.prettyIndent);
};

Case.prototype.yamlString = function(obj) {
  return jsYaml.safeDump(obj, {noCompatMode: true, skipInvalid: true});
};
