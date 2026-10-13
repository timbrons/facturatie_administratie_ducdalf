import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { App } from "./App"
import { isVerbindingsfout } from "./lib/pb"
import { voorladenGoogle } from "./lib/gmail"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Bij een onbereikbare server de laatst geladen gegevens blijven tonen.
      retry: (pogingen, fout) => isVerbindingsfout(fout) && pogingen < 2,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
})

// De Google-component alvast laden, zodat koppelen later direct bij een klik kan.
voorladenGoogle()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
