import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          gsap: ["gsap"],
        },
      },
    },
  },
});
