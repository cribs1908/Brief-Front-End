import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  build: {
    sourcemap: false, // Disable sourcemaps in production to avoid deployment errors
  },
  server: {
    allowedHosts: [
      "https://b93d6f57d034.ngrok-free.app",
      "aecae2406768.ngrok-free.app"
    ],
    hmr: {
      overlay: false,
    },
  },
});
