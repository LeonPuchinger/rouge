import { AppError } from "./error.ts";

type Loggable = string | AppError;
enum Loglevel {
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
}

const defaultConfig: LoggerConfig = {
  loglevel: Loglevel.info,
  format: (message: Loggable, loglevel: Loglevel) => {
    const now = new Date();
    const formattedTime =
      `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    const formattedLevel = loglevelToString[loglevel].toUpperCase();
    return `[${formattedLevel}, ${formattedTime}]: ${message}`;
  },
};

function log(message: Loggable, loglevel: Loglevel) {
  if (loglevel >= defaultConfig.loglevel) {
    console.log(defaultConfig.format(message, loglevel));
  }
}

export const debug = (message: Loggable) => log(message, Loglevel.debug);
export const info = (message: Loggable) => log(message, Loglevel.info);
export const warning = (message: Loggable) => log(message, Loglevel.warning);
export const error = (message: Loggable) => log(message, Loglevel.error);
