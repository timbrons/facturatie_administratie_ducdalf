import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Relatieve paden ("./"): dezelfde build werkt onder elk adres, zowel
// https://timbrons.github.io/facturatie_administratie_ducdalf/ als een eigen
// domein (https://verhuur.vakantiehuis-ducdalf.nl/) of vanaf de NAS. De app
// gebruikt hash-routing (#/...), dus alle pagina's laden dezelfde index.html.
// Met VITE_BASE kan desgewenst een vast pad worden gekozen.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  return {
    base: env.VITE_BASE || "./",
    // De PDF-bibliotheek (± 1,2 MB) wordt pas geladen bij het maken van een factuur.
    build: { chunkSizeWarningLimit: 1300 },
    plugins: [react(), tailwindcss()],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  }
})
