import { pb } from "./pb"
import { aantalNachten } from "./boeking"
import { markeerVerstuurd, pdfUrl } from "./facturen"
import { verstuurViaGmail } from "./gmail"
import { huurderNaam, type Betaling, type Boeking, type Factuur, type Instellingen, type MailLog, type MailSjabloon, type Taal } from "./types"
import { formatLang } from "../domein/datum"
import { formatEuro } from "../domein/geld"
import { openstaand } from "../domein/factuur"
import { aanmeldLink, STAP_NA_SJABLOON, type Variabelen } from "../domein/sjablonen"
import { adres, bouwMime, naarBase64Url, nieuwMessageId, type MailBijlage } from "../domein/mime"
import { isBijOfVoorbij, positie, type WorkflowStap } from "../domein/workflow"

/** De geldige (definitieve, niet geannuleerde) factuur van een boeking, of null. */
export function actueleFactuur(b: Boeking, facturen: Factuur[]): Factuur | null {
  return facturen.filter((f) => f.boeking === b.id && f.soort === "factuur" && f.nummer && !f.geannuleerd_op).at(-1) ?? null
}

export function variabelenVoor(b: Boeking, inst: Instellingen, facturen: Factuur[], betalingen: Betaling[]): Variabelen {
  const h = b.expand?.huurder
  const f = actueleFactuur(b, facturen)
  const betaald = betalingen.filter((p) => p.boeking === b.id).reduce((t, p) => t + p.bedrag_cent, 0)
  const definitief = facturen.filter((x) => x.boeking === b.id && x.nummer)
  return {
    voornaam: h?.voornaam || huurderNaam(h),
    achternaam: h?.achternaam ?? "",
    naam: huurderNaam(h),
    aankomst: formatLang(b.aankomst),
    vertrek: formatLang(b.vertrek),
    nachten: String(aantalNachten(b)),
    personen: String(b.volwassenen + b.kinderen),
    kenteken: b.kenteken,
    factuurnummer: f?.nummer ?? "",
    bedrag_totaal: f ? formatEuro(f.totaal_cent) : "",
    bedrag_aanbetaling: f && f.aanbetaling_cent ? formatEuro(f.aanbetaling_cent) : "",
    vervaldatum_aanbetaling: f?.aanbetaling_vervaldatum ? formatLang(f.aanbetaling_vervaldatum) : "",
    bedrag_rest: f ? formatEuro(f.totaal_cent - f.aanbetaling_cent) : "",
    vervaldatum_rest: f?.rest_vervaldatum ? formatLang(f.rest_vervaldatum) : "",
    bedrag_open: definitief.length ? formatEuro(Math.max(0, openstaand(definitief, betaald))) : "",
    betaalinstructie: f?.gegevens?.betaaltekst ?? "",
    iban: inst.bank_iban,
    rekeninghouder: inst.bank_tnv,
    link_aanmeldformulier: aanmeldLink(inst.aanmeldformulier_url, b.code),
    afzender: inst.afzender_naam,
  }
}

/** Sjabloon in de taal van de huurder, met Nederlands als terugval. */
export function kiesSjabloon(sjablonen: MailSjabloon[], sleutel: string, taal: Taal | "" | undefined): MailSjabloon | null {
  return (
    sjablonen.find((s) => s.sleutel === sleutel && s.taal === (taal || "nl")) ??
    sjablonen.find((s) => s.sleutel === sleutel && s.taal === "nl") ??
    null
  )
}

async function alsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bijlage kon niet worden geladen (${res.status}).`)
  const buf = new Uint8Array(await res.arrayBuffer())
  let bin = ""
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

export interface BijlageKeuze {
  soort: "brochure" | "factuur"
  bestandsnaam: string
}

/** Welke bijlagen zijn beschikbaar voor deze boeking. */
export function beschikbareBijlagen(inst: Instellingen, factuur: Factuur | null): BijlageKeuze[] {
  const uit: BijlageKeuze[] = []
  if (inst.brochure) uit.push({ soort: "brochure", bestandsnaam: "Informatiebrochure Duc'dalf.pdf" })
  if (factuur?.pdf) uit.push({ soort: "factuur", bestandsnaam: `Factuur_${factuur.nummer}.pdf` })
  return uit
}

async function laadBijlagen(keuzes: BijlageKeuze[], inst: Instellingen, factuur: Factuur | null): Promise<MailBijlage[]> {
  const uit: MailBijlage[] = []
  for (const k of keuzes) {
    if (k.soort === "brochure") {
      const token = await pb.files.getToken()
      uit.push({ bestandsnaam: k.bestandsnaam, mimeType: "application/pdf", base64: await alsBase64(pb.files.getURL(inst, inst.brochure, { token })) })
    } else if (k.soort === "factuur" && factuur?.pdf) {
      uit.push({ bestandsnaam: k.bestandsnaam, mimeType: "application/pdf", base64: await alsBase64(await pdfUrl(factuur)) })
    }
  }
  return uit
}

export interface Verzendopdracht {
  boeking: Boeking
  inst: Instellingen
  stappen: WorkflowStap[]
  factuur: Factuur | null
  eerdere: MailLog[]
  aan: string
  onderwerp: string
  tekst: string
  bijlagen: BijlageKeuze[]
  sjablonen: string[]
}

/**
 * Verstuurt de mail via Gmail, legt hem vast in het maillog en schuift de
 * workflow door (bijv. naar "Factuur verstuurd"). Wordt alleen aangeroepen na
 * een klik op "Versturen" in de preview.
 */
export async function verstuurMail(o: Verzendopdracht): Promise<MailLog> {
  const vorige = o.eerdere.filter((m) => m.boeking === o.boeking.id).sort((a, b) => a.created.localeCompare(b.created))
  const messageIds = vorige.map((m) => m.message_id).filter(Boolean)
  const threadId = vorige.map((m) => m.gmail_thread_id).filter(Boolean).at(-1)
  const messageId = nieuwMessageId("vakantiehuis-ducdalf.nl")
  const bijlagen = await laadBijlagen(o.bijlagen, o.inst, o.factuur)
  const mime = bouwMime({
    van: adres(o.inst.afzender_naam, o.inst.afzender_email),
    aan: o.aan,
    onderwerp: o.onderwerp,
    tekst: o.tekst,
    bijlagen,
    messageId,
    antwoordOp: messageIds.at(-1),
    referenties: messageIds.slice(-10),
  })
  const verzonden = await verstuurViaGmail(naarBase64Url(mime), threadId)

  // Workflow: verder naar de verste stap die bij de verstuurde sjablonen hoort.
  const doelen = o.sjablonen.map((s) => STAP_NA_SJABLOON[s]).filter(Boolean)
  let statusNa = ""
  if (o.sjablonen.includes("factuur") && o.factuur && o.factuur.nummer && !o.factuur.vergrendeld) {
    await markeerVerstuurd(o.factuur, o.boeking, o.stappen)
  }
  const verste = doelen.sort((a, b) => positie(o.stappen, b) - positie(o.stappen, a))[0]
  if (verste && o.boeking.status !== "geannuleerd" && !isBijOfVoorbij(o.stappen, o.boeking, verste)) {
    await pb.collection("boekingen").update(o.boeking.id, { status: verste })
    statusNa = verste
  }

  return pb.collection("mail_log").create<MailLog>({
    boeking: o.boeking.id,
    aan: o.aan,
    onderwerp: o.onderwerp,
    tekst: o.tekst,
    bijlagen: bijlagen.map((b) => b.bestandsnaam),
    sjablonen: o.sjablonen,
    gmail_message_id: verzonden.id,
    gmail_thread_id: verzonden.threadId,
    message_id: messageId,
    status_na: statusNa,
  })
}
