# Rouge Programming Language

Teach your grandmother how to program.

## Build

The language can be compiled into a single ES-module.
The module can be run in the browser and is found in `dist/` after bundling.

```
npm install
npm run build
```

Deno is used to run/debug the language locally.
The entrypoint for the program can be found in `src/cli.ts`

```
deno run src/cli.ts
```
