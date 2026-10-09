import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发服务器代理目标：
//   npm run dev        → 本地服务端 127.0.0.1:3210
//   npm run dev:prod   → 线上服务端 cnb.992498.xyz（用线上数据调前端）
const local_proxy = "http://127.0.0.1:3210/";
const local_ws_proxy = "ws://127.0.0.1:3210/";
const prod_proxy = "https://cnb.992498.xyz/";
const prod_ws_proxy = "wss://cnb.992498.xyz/";

export default defineConfig(({ mode }) => {
  const isProd = mode === "prod";
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": { target: isProd ? prod_proxy : local_proxy, changeOrigin: true },
        "/ws": { target: isProd ? prod_ws_proxy : local_ws_proxy, changeOrigin: true, ws: true },
      },
    },
  };
});
