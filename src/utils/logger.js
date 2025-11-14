const winston = require('winston');
const path = require('path');
const config = require('../config');

// Definir niveles de log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Definir colores para cada nivel
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Formato personalizado
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Formato para consola con colores
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message} ${
      info.metadata && Object.keys(info.metadata).length > 0
        ? JSON.stringify(info.metadata, null, 2)
        : ''
    }`
  )
);

// Configurar transportes
const transports = [
  // Logs de errores en archivo separado
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Todos los logs en archivo combinado
  new winston.transports.File({
    filename: path.join('logs', 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// En desarrollo, también mostrar en consola
if (config.nodeEnv !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// Crear logger
const logger = winston.createLogger({
  level: config.nodeEnv === 'development' ? 'debug' : 'info',
  levels,
  format,
  transports,
  exitOnError: false,
});

// Wrapper para agregar metadata de forma más fácil
const loggerWrapper = {
  error: (message, metadata = {}) => {
    logger.error(message, { metadata });
  },
  warn: (message, metadata = {}) => {
    logger.warn(message, { metadata });
  },
  info: (message, metadata = {}) => {
    logger.info(message, { metadata });
  },
  http: (message, metadata = {}) => {
    logger.http(message, { metadata });
  },
  debug: (message, metadata = {}) => {
    logger.debug(message, { metadata });
  },
};

module.exports = loggerWrapper;
