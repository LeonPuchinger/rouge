import { run } from "./main.ts";
import * as logger from "./util/logger.ts";

// TODO: get loglevel from environment variable or some other parameter
logger.updateLoggerConfig({ loglevel: logger.Loglevel.debug });

// test with example string
try {
  const findings = run("a = 1");
  findings.errors.forEach(logger.error);
  findings.warnings.forEach(logger.warning);
} catch(error) {
  logger.error(error);
}
