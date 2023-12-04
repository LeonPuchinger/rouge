import { run } from "./main.ts";
import * as logger from "./util/logger.ts";

// TODO: get loglevel from environment variable or some other parameter
logger.updateLoggerConfig({ loglevel: logger.Loglevel.debug });

// test with example string
const interpretationErrors = run("a = 1");
interpretationErrors.forEach(logger.error);
