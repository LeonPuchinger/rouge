import { run } from "./main.ts";
import * as logger from "./util/logger.ts";
// @deno-types="@types/yargs"
import yargs from "yargs";

// TODO: get loglevel from environment variable or some other parameter
logger.updateLoggerConfig({ loglevel: logger.Loglevel.debug });

const cli = yargs(Deno.args)
  .strict()
  .demandCommand()
  .completion();

cli.command(
  "run [entry point]",
  "Start execution of a rouge project from a file",
  (yargs) => {
    return yargs
      .positional("entry point", {
        describe: "The file from which to start execution",
        type: "string",
        demandOption: true,
      });
  },
  (argv) => {
    const _input_file = argv["entry point"];

    // test with example string
    try {
      const findings = run("a = 1\nb = a == 1");
      findings.errors.forEach(logger.error);
      findings.warnings.forEach(logger.warning);
    } catch (error) {
      logger.error(error);
    }
  },
);

cli.parse();
