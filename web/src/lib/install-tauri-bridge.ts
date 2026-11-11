import { installTauriBridge } from "@/lib/tauri-bridge"

// Imported first by `main.tsx`: other modules (i18n syncs the language on load)
// run while their imports are evaluated, before `main.tsx`'s own code.
installTauriBridge()
