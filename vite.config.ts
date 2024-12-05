import { defineConfig } from "vite";
import vite_dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        target: "esnext",
        outDir: "dist",
        lib: {
            entry: "src/main.ts",
            formats: ["es"],
            name: "Rouge",
            fileName: (format) => `index.${format}.js`,
        },
    },
    plugins: [
        vite_dts({
            rollupTypes: true,
            exclude: ["src/cli.ts"],
        }),
    ],
});
