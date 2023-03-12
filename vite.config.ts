import { defineConfig } from "vite";

export default defineConfig({
    build: {
        target: 'esnext',
        outDir: 'dist',
        lib: {
            entry: 'src/main.ts',
            name: 'Fluffycakes',
            fileName: format => `fluffycakes.${format}.js`,
        },
        rollupOptions: {
            // Make sure to exclude any unwanted files or directories from the build output
            output: {
                
            },
        },
    }
});
