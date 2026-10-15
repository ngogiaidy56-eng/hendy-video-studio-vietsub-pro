import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/pipeline/",
  plugins: [react()],
  build: {
    outDir: "../webApp/build/dist/js/productionExecutable/pipeline",
    emptyOutDir: true,
  },
});
