import { useEffect, useState } from "react"
import { pb } from "./pb"

/**
 * Controleert regelmatig of de backend (NAS) bereikbaar is. De app blijft
 * werken met de laatst geladen gegevens en toont een duidelijke melding.
 */
export function useServerBereikbaar(): boolean {
  const [bereikbaar, setBereikbaar] = useState(true)
  useEffect(() => {
    let actief = true
    async function controleer() {
      try {
        await pb.health.check({ requestKey: null })
        if (actief) setBereikbaar(true)
      } catch {
        if (actief) setBereikbaar(false)
      }
    }
    controleer()
    const timer = window.setInterval(controleer, 30_000)
    const online = () => controleer()
    window.addEventListener("online", online)
    window.addEventListener("offline", () => setBereikbaar(false))
    return () => {
      actief = false
      window.clearInterval(timer)
      window.removeEventListener("online", online)
    }
  }, [])
  return bereikbaar
}
