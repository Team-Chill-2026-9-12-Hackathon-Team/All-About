import { defineConfig } from "vite";

const port = Number(process.env.ALLABOUT_WEB_PORT ?? 5174);
const backendUrl = process.env.ALLABOUT_BACKEND_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: false,
        timeout: 0,
        proxyTimeout: 0,
        configure(proxy) {
          proxy.on("proxyRes", (proxyRes, req) => {
            if (req.url?.includes("/events")) {
              proxyRes.headers["cache-control"] = "no-cache, no-transform";
              proxyRes.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
    },
  },
});
