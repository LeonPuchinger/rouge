import { run } from "./main.ts";
import * as logger from "./util/logger.ts";
import { Loglevel, updateLoggerConfig } from "./util/logger.ts";
// @deno-types="@types/yargs"
import yargs from "yargs";

const cli = yargs(Deno.args);

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

cli
  .option(
    "loglevel",
    {
      description:
        'The loglevel used by the language itself; can also be passed via the environment variable "ROUGE_LOGLEVEL"',
      choices: Object.values(Loglevel),
      default: Deno.env.get("ROUGE_LOGLEVEL") ?? Loglevel.info,
      type: "string",
    },
  ).middleware((argv) => {
    updateLoggerConfig({ loglevel: (argv.loglevel as Loglevel) });
  });

cli
  .strict()
  .demandCommand()
  .completion()
  .parse();
