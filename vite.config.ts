import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import {
  createApiMiddleware,
  createStateWatcherHub,
} from "./scripts/server.mjs";
import { resolveStateDir } from "./scripts/state-store.mjs";

function mhfLocalApiPlugin() {
  return {
    name: "neuroverse-local-api",
    configureServer(server) {
      const stateDir = resolveStateDir();
      const hub = createStateWatcherHub(stateDir);
      const apiMiddleware = createApiMiddleware({ stateDir, hub });

      server.middlewares.use((req, res, next) => {
        apiMiddleware(req, res, next);
      });

      server.httpServer?.once("close", () => {
        hub.close();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mhfLocalApiPlugin()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
