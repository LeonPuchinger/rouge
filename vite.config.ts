import { defineConfig } from "vite";

export default defineConfig({
    build: {
        target: 'esnext',
        outDir: 'dist',
        lib: {
            entry: 'src/main.ts',
            name: 'Rouge',
            fileName: format => `rouge.${format}.js`,
        },
    }
});
