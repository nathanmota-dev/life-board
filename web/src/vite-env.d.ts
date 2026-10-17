/// <reference types="vite/client" />

interface Window {
  desktop: {
    getVersion: () => Promise<string>
  }
}
