// Gedeelde hulpfuncties voor de hooks. Hooks draaien elk in een eigen
// JavaScript-omgeving, dus dit bestand wordt binnen elke handler met
// require() geladen.

module.exports = {
  // E-mailadressen die mogen inloggen, uit de omgevingsvariabele
  // DUCDALF_ALLOWED_EMAILS (komma-gescheiden). Leeg = niemand.
  toegestaneEmails() {
    return String($os.getenv("DUCDALF_ALLOWED_EMAILS") || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  },

  isToegestaan(email) {
    if (!email) return false
    return this.toegestaneEmails().indexOf(String(email).trim().toLowerCase()) !== -1
  },
}
