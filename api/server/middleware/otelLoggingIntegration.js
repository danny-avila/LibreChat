const Transport = require('winston-transport');
const logsAPI = require('@opentelemetry/api-logs');

function OpenTelemetryTransport(opts) {
  if (!(this instanceof OpenTelemetryTransport)) {
    return new OpenTelemetryTransport(opts);
  }

  Transport.call(this, opts);

  this.name = 'opentelemetry';
  this.level = opts.level || 'debug';
  this.loggerProvider = opts.loggerProvider;
  this.logger = this.loggerProvider.getLogger(opts.loggerName || 'winston-logger');
}

require('util').inherits(OpenTelemetryTransport, Transport);

OpenTelemetryTransport.prototype.log = function (info, callback) {
  const self = this;

  setImmediate(function () {
    self.emit('logged', info);
  });

  const severityMap = {
    error: logsAPI.SeverityNumber.ERROR,
    warn: logsAPI.SeverityNumber.WARN,
    info: logsAPI.SeverityNumber.INFO,
    http: logsAPI.SeverityNumber.INFO,
    verbose: logsAPI.SeverityNumber.DEBUG,
    debug: logsAPI.SeverityNumber.DEBUG,
    silly: logsAPI.SeverityNumber.TRACE,
  };

  const severityText = info.level.toUpperCase();

  const attributes = { 'log.type': 'winston', level: severityText };

  if (typeof info === 'object' && info !== null) {
    Object.keys(info).forEach(function (key) {
      if (!['level', 'message', 'timestamp'].includes(key)) {
        attributes[key] = info[key];
      }
    });
  }

  this.logger.emit({
    severityNumber: severityMap[info.level] || logsAPI.SeverityNumber.INFO,
    severityText: info.level.toUpperCase(),
    body: info.message,
    attributes: attributes,
  });

  if (callback) {
    callback();
  }
};

module.exports = OpenTelemetryTransport;
