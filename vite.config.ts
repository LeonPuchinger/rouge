import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        target: "esnext",
        outDir: "dist",
        lib: {
            entry: "src/main.ts",
            name: "Rouge",
            fileName: (format) => `rouge.${format}.js`,
        },
    },
    plugins: [
        dts({
            rollupTypes: true,
        }),
    ],
});
