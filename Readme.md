# Rouge Programming Language

Teach your grandmother how to program.

## State of development

Rouge is in active development (WIP) with many core features still missing.
Until its initial 1.0 release, breaking changes may occur without warning.

## Build

The language can be compiled into a single ES-module.
The module can be run in the browser and is found in `dist/` after bundling.

```
npm install
npm run build
```

Deno is used to run/debug the language locally.
The entrypoint for the program can be found in `src/cli.ts`.
Deno version >= 2.0 is required.

```
deno run --allow-all src/cli.ts
```

To build a self-contained executable, Deno is used as well.

```
deno compile --allow-all --output rouge src/cli.ts
```

## Usage

Assuming the language has been compiled into an executable called `rouge` and is available on PATH, a file called `my_app.rouge` can be executed with the following command:

```
rouge run main.rouge
```

Further information about the command line interface can be obtained by running:

```
rouge --help
```
