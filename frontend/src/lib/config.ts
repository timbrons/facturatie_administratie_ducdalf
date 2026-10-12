// Publieke configuratie uit build-time omgevingsvariabelen (niet geheim).
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin,
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "",
  devLogin: import.meta.env.VITE_DEV_LOGIN === "true",
}
