// Bouwt een e-mail (RFC 2822 / MIME) voor de Gmail API (users.messages.send, veld `raw`).

export interface MailBijlage {
  bestandsnaam: string
  mimeType: string
  /** Inhoud als gewone base64 (niet url-safe) */
  base64: string
}

export interface Mail {
  van: string
  aan: string
  cc?: string
  onderwerp: string
  tekst: string
  bijlagen?: MailBijlage[]
  messageId?: string
  /** Message-ID van de eerdere mail in deze thread */
  antwoordOp?: string
  referenties?: string[]
}

const CRLF = "\r\n"

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Kopregel met niet-ASCII-tekens (RFC 2047). */
export function kopWaarde(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8Base64(s)}?=`
}

/** "Familie Brons <adres@x.nl>" met correcte codering van de naam. */
export function adres(naam: string, email: string): string {
  if (!naam) return email
  const veilig = /^[\x20-\x7e]*$/.test(naam) ? `"${naam.replace(/(["\\])/g, "\\$1")}"` : kopWaarde(naam)
  return `${veilig} <${email}>`
}

function regels76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&" + CRLF).trimEnd()
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Eenvoudige HTML-versie: alinea's, regelafbrekingen en klikbare links. */
export function tekstNaarHtml(tekst: string): string {
  const html = escapeHtml(tekst)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n")
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${html}</body></html>`
}

export function bouwMime(m: Mail, grens = `ducdalf_${Math.random().toString(36).slice(2)}`): string {
  const kop: string[] = [
    `From: ${m.van}`,
    `To: ${m.aan}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    `Subject: ${kopWaarde(m.onderwerp)}`,
    "MIME-Version: 1.0",
    ...(m.messageId ? [`Message-ID: ${m.messageId}`] : []),
    ...(m.antwoordOp ? [`In-Reply-To: ${m.antwoordOp}`] : []),
    ...(m.referenties?.length ? [`References: ${m.referenties.join(" ")}`] : []),
  ]
  const alt = `${grens}_alt`
  const tekstDelen = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    regels76(utf8Base64(m.tekst)),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    regels76(utf8Base64(tekstNaarHtml(m.tekst))),
    `--${alt}--`,
  ].join(CRLF)

  if (!m.bijlagen?.length) {
    return [...kop, `Content-Type: multipart/alternative; boundary="${alt}"`, "", tekstDelen, ""].join(CRLF)
  }
  const delen = [
    `--${grens}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    tekstDelen,
    ...m.bijlagen.flatMap((b) => [
      `--${grens}`,
      `Content-Type: ${b.mimeType}; name="${kopWaarde(b.bestandsnaam)}"`,
      `Content-Disposition: attachment; filename="${kopWaarde(b.bestandsnaam)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      regels76(b.base64),
    ]),
    `--${grens}--`,
  ].join(CRLF)
  return [...kop, `Content-Type: multipart/mixed; boundary="${grens}"`, "", delen, ""].join(CRLF)
}

/** Base64url zonder opvulling, zoals de Gmail API verwacht. */
export function naarBase64Url(mime: string): string {
  return utf8Base64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Eigen Message-ID, zodat vervolgmails ernaar kunnen verwijzen. */
export function nieuwMessageId(domein: string): string {
  const willekeurig = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")
  return `<${Date.now().toString(36)}.${willekeurig}@${domein}>`
}
