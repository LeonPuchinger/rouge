import * as interpreter from "./main.ts";
import { VirtualTextFile } from "./streams.ts";
import { onReadLine } from "./util/file.ts";
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
  const stdout = new VirtualTextFile();
  stdout.onNewChunk((chunk) => {
    Deno.stdout.writeSync(new TextEncoder().encode(chunk));
  });
  const stderr = new VirtualTextFile();
  stderr.onNewChunk((chunk) => {
    Deno.stderr.writeSync(new TextEncoder().encode(chunk));
  });
  const stdin = new VirtualTextFile();
  const stdinReadSubscription = onReadLine(Deno.stdin, (line) => {
    stdin.writeLine(line);
  });
  try {
    const findings = interpreter.run(
      file_contents,
      stdout,
      stderr,
      stdin,
    );
    findings.errors.forEach(logger.error);
    findings.warnings.forEach(logger.warning);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`${error.message}\n${error.stack}`);
    } else {
      logger.error("Unrecognized error");
    }
  }
  stdinReadSubscription.cancel();
  stdout.close();
  stderr.close();
  stdin.close();
  Deno.stdin.close();
}

const cli = yargs(Deno.args).scriptName("rouge");

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
  .completion(
    "shell-completion",
    "generate a completion script for bash/zsh",
  )
  .parse();
