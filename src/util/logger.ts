import { AppError } from "./error.ts";

type Loggable = string | AppError;
export enum Loglevel {
  debug,
  info,
  warning,
  error,
}

const loglevelToString: Record<Loglevel, string> = {
  [Loglevel.debug]: "debug",
  [Loglevel.info]: "info",
  [Loglevel.warning]: "warning",
  [Loglevel.error]: "error",
};

interface LoggerConfig {
  loglevel: Loglevel;
  format: (message: Loggable, loglevel: Loglevel) => string;
  colors: Partial<Record<Loglevel, string>>;
}

let loggerConfig: LoggerConfig = {
  loglevel: Loglevel.info,
  format: (message: Loggable, loglevel: Loglevel) => {
    const now = new Date();
    const formattedTime =
      `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    const formattedLevel = loglevelToString[loglevel].toUpperCase();
    return `[${formattedLevel}, ${formattedTime}]: ${message}`;
  },
  colors: {
    [Loglevel.debug]: "\x1b[90m%s\x1b[0m",
    [Loglevel.error]: "\x1b[31m%s\x1b[0m",
    [Loglevel.warning]: "\x1b[33m%s\x1b[0m",
  },
};

/**
 * Configure the logger globally
 * 
 * @param updateConfig The configuration to override the current one.
 * Only entries present in the new config are replaced in the current one.
 */
export function updateLoggerConfig(updateConfig: Partial<LoggerConfig>) {
  loggerConfig = {
    ...loggerConfig,
    ...updateConfig,
  };
}

function log(message: Loggable, loglevel: Loglevel) {
  if (loglevel >= loggerConfig.loglevel) {
    const color = loggerConfig.colors[loglevel] ?? "";
    console.log(color, loggerConfig.format(message, loglevel));
  }
}

export const debug = (message: Loggable) => log(message, Loglevel.debug);
export const info = (message: Loggable) => log(message, Loglevel.info);
export const warning = (message: Loggable) => log(message, Loglevel.warning);
export const error = (message: Loggable) => log(message, Loglevel.error);
