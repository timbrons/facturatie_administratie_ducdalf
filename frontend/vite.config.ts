import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// `VITE_BASE` bepaalt het pad waaronder de app draait:
//  - GitHub Pages:            /facturatie_administratie_ducdalf/
//  - PocketBase (pb_public):  /
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    base: env.VITE_BASE || "/facturatie_administratie_ducdalf/",
    // De PDF-bibliotheek (± 1,2 MB) wordt pas geladen bij het maken van een factuur.
    build: { chunkSizeWarningLimit: 1300 },
    plugins: [react(), tailwindcss()],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  }
})
