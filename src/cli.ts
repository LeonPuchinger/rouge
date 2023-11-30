import { run } from "./main.ts";
import * as logger from "./util/logger.ts";

// TODO: get loglevel from environment variable or some other parameter
logger.updateLoggerConfig({ loglevel: logger.Loglevel.debug });

// test with example string
const interpretationError = run("a = 1");
interpretationError.then((errors) => errors.forEach(logger.error));
