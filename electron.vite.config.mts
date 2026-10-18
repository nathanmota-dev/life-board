import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "electron-vite"

const root = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(root, "desktop/src/main.ts") },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(root, "desktop/src/preload.ts") },
      },
    },
  },
  renderer: {
    root: resolve(root, "web"),
    publicDir: resolve(root, "public"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": resolve(root, "web/src") },
    },
    server: { host: "127.0.0.1", port: 5180, strictPort: true },
    build: {
      rollupOptions: { input: resolve(root, "web/index.html") },
    },
  },
})
