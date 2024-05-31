import * as interpreter from "./main.ts";
import * as logger from "./util/logger.ts";
import { Loglevel, updateLoggerConfig } from "./util/logger.ts";
// @deno-types="@types/yargs"
import yargs from "yargs";

/**
 * Executes the interpreter with the contents of the file located at `input_file_path`.
 */
function run(input_file_path: string) {
  let file_contents: string;
  try {
    file_contents = Deno.readTextFileSync(input_file_path);
  } catch {
    console.log("The input file does not exist.");
    Deno.exit(1);
  }
  try {
    const findings = interpreter.run(file_contents);
    findings.errors.forEach(logger.error);
    findings.warnings.forEach(logger.warning);
  } catch (error) {
    logger.error(error);
  }
}

const cli = yargs(Deno.args);

cli.command(
  "run [entrypoint]",
  "Start execution of a rouge project from a file",
  (yargs) => {
    return yargs
      .positional("entrypoint", {
        describe: "The file from which to start execution",
        type: "string",
        demandOption: true,
      });
  },
  (argv) => run(argv["entrypoint"]),
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
