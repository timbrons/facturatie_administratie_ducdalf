import { createElement } from "react"
import type { FactuurPdfProps } from "./FactuurPdf"

/**
 * Maakt de factuur-PDF in de browser. @react-pdf/renderer is groot en wordt
 * daarom pas geladen als er echt een PDF nodig is.
 */
export async function maakFactuurPdf(props: FactuurPdfProps): Promise<Blob> {
  const [{ pdf }, { FactuurPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./FactuurPdf")])
  return pdf(createElement(FactuurPdf, props) as Parameters<typeof pdf>[0]).toBlob()
}

/** Laadt een afbeelding als data-URL (voor de huisfoto in de PDF). */
export async function laadAfbeelding(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
