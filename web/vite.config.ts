import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const local_proxy = "http://127.0.0.1:3210/";
const local_ws_proxy = "ws://127.0.0.1:3210/";
const prod_proxy = "https://cnb.992498.xyz/";
const prod_ws_proxy = "wss://cnb.992498.xyz/";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: local_proxy, changeOrigin: true },
      "/ws": { target: local_ws_proxy, changeOrigin: true, ws: true },
    },
  },
});
