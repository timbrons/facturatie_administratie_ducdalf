// Publieke configuratie uit build-time omgevingsvariabelen (niet geheim).
const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || ""

export const config = {
  // Zonder VITE_API_URL gaat de app ervan uit dat PocketBase de app zelf serveert (pb_public).
  apiUrl: apiUrl || window.location.origin,
  /** Op GitHub Pages draait geen backend: zonder VITE_API_URL kan de app nergens heen. */
  apiUrlOntbreekt: !apiUrl && window.location.hostname.endsWith("github.io"),
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "",
  devLogin: import.meta.env.VITE_DEV_LOGIN === "true",
}
