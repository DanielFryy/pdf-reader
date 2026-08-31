import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import type { ViteUserConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: ViteUserConfig = {
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setupBeforeEnv.ts", "./src/test/setup.tsx"],
    include: ["**/*.test.{ts,tsx}"],
    globals: true
  },
  resolve: { alias: { "@": resolve(__dirname, "./src") } }
};

export default config;
