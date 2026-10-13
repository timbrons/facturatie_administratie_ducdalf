import { pb } from "./pb"
import { aantalNachten } from "./boeking"
import { huurderNaam, type Betaling, type Boeking, type Factuur, type Instellingen } from "./types"
import { vandaag } from "../domein/datum"
import { berekenTermijnen } from "../domein/betaling"
import { betaaltekst, bouwFactuurregels, creditRegels, totaalVan, type Factuurregel } from "../domein/factuur"
import { isBijOfVoorbij, type WorkflowStap } from "../domein/workflow"
import type { FactuurGegevens } from "../pdf/FactuurPdf"
import { laadAfbeelding, maakFactuurPdf } from "../pdf/genereer"
import { driveBeschikbaar, zetInDrive } from "./drive"
import { factuurBestandsnaam, factuurMap } from "../domein/bestandsnamen"

// Alle stappen rond facturen: concept maken, definitief maken (nummeren +
// PDF), als verstuurd markeren (vergrendelen) en crediteren.

function gegevensVoor(b: Boeking, inst: Instellingen, tekst: string): FactuurGegevens {
  const h = b.expand?.huurder
  return {
    huurder: {
      naam: [h?.aanhef, huurderNaam(h)].filter(Boolean).join(" "),
      adres: h?.adres ?? "",
      postcodePlaats: [h?.postcode, h?.plaats].filter(Boolean).join(" "),
      land: h?.land ?? "",
    },
    afzender: {
      naam: inst.afzender_naam,
      adresregels: inst.afzender_adres.split(/\r?\n/).map((r) => r.trim()).filter(Boolean),
      telefoon: inst.afzender_telefoon,
      email: inst.afzender_email,
    },
    accommodatie: inst.accommodatie_naam,
    bank: { tnv: inst.bank_tnv, iban: inst.bank_iban },
    aankomst: b.aankomst,
    vertrek: b.vertrek,
    betaaltekst: tekst,
  }
}

/** Waarom er (nog) geen factuur gemaakt kan worden, of null. */
export function factuurBezwaar(b: Boeking, inst: Instellingen): string | null {
  if (!b.expand?.huurder) return "Koppel eerst een huurder aan de boeking."
  if (!b.tb_portaal_op) return "Leg eerst het bedrag voor de toeristenbelasting uit het portaal vast (stap Toeristenbelasting berekenen)."
  if (!inst.bank_iban || !inst.bank_tnv || !inst.afzender_naam) return "Vul eerst de afzender- en bankgegevens in bij Instellingen."
  return null
}

function inhoud(b: Boeking, inst: Instellingen, factuurdatum: string) {
  const regels = bouwFactuurregels({ ...b, extras: b.extras ?? null, nachten: aantalNachten(b) })
  const totaal = totaalVan(regels)
  const termijnen = berekenTermijnen({
    totaalCent: totaal,
    betaalwijze: b.betaalwijze === "ineens" ? "ineens" : "aanbetaling",
    aanbetalingPct: b.aanbetaling_pct || inst.aanbetaling_pct,
    factuurdatum,
    aankomst: b.aankomst,
    aanbetalingTermijnMaanden: inst.aanbetaling_termijn_maanden,
    restWekenVoorAankomst: inst.rest_weken_voor_aankomst,
  })
  const tekst = betaaltekst(termijnen, b.aanbetaling_pct || inst.aanbetaling_pct, inst.rest_weken_voor_aankomst)
  return {
    factuurdatum,
    regels,
    totaal_cent: totaal,
    aanbetaling_cent: termijnen.aanbetalingCent,
    aanbetaling_vervaldatum: termijnen.aanbetalingVervaldatum ?? "",
    rest_vervaldatum: termijnen.restVervaldatum,
    gegevens: gegevensVoor(b, inst, tekst),
  }
}

export async function maakConcept(b: Boeking, inst: Instellingen): Promise<Factuur> {
  return pb.collection("facturen").create<Factuur>({ boeking: b.id, soort: "factuur", ...inhoud(b, inst, vandaag()) })
}

/** Concept bijwerken naar de actuele boekingsgegevens. */
export async function vernieuwConcept(f: Factuur, b: Boeking, inst: Instellingen): Promise<Factuur> {
  if (f.soort === "credit") return f
  return pb.collection("facturen").update<Factuur>(f.id, inhoud(b, inst, vandaag()))
}

export async function maakCredit(origineel: Factuur): Promise<Factuur> {
  const regels = creditRegels(origineel.regels ?? [])
  return pb.collection("facturen").create<Factuur>({
    boeking: origineel.boeking,
    soort: "credit",
    verwijst_naar: origineel.id,
    factuurdatum: vandaag(),
    regels,
    totaal_cent: totaalVan(regels),
    aanbetaling_cent: 0,
    gegevens: { ...(origineel.gegevens as FactuurGegevens), betaaltekst: "", creditVoor: origineel.nummer },
  })
}

async function huisfoto(inst: Instellingen): Promise<string | null> {
  if (inst.huisfoto) {
    const token = await pb.files.getToken()
    const foto = await laadAfbeelding(pb.files.getURL(inst, inst.huisfoto, { token }))
    if (foto) return foto
  }
  return laadAfbeelding(`${import.meta.env.BASE_URL}huisfoto.jpg`)
}

export async function pdfVoor(f: Factuur, inst: Instellingen): Promise<Blob> {
  return maakFactuurPdf({
    nummer: f.nummer,
    soort: f.soort,
    factuurdatum: f.factuurdatum,
    regels: (f.regels ?? []) as Factuurregel[],
    totaalCent: f.totaal_cent,
    gegevens: f.gegevens as FactuurGegevens,
    foto: await huisfoto(inst),
  })
}

/**
 * Een geïmporteerde factuur heeft geen PDF. Dit maakt er een weergave van op
 * basis van de overgenomen gegevens, duidelijk gemarkeerd als nagemaakt.
 * Ontbreekt het adres, dan wordt het huidige adres van de huurder gebruikt.
 */
export async function nagemaaktePdf(f: Factuur, b: Boeking, inst: Instellingen): Promise<Blob> {
  const g = f.gegevens as FactuurGegevens
  const huidig = gegevensVoor(b, inst, "").huurder
  return maakFactuurPdf({
    nummer: f.nummer,
    soort: f.soort,
    factuurdatum: f.factuurdatum,
    regels: (f.regels ?? []) as Factuurregel[],
    totaalCent: f.totaal_cent,
    gegevens: { ...g, huurder: g.huurder?.adres ? g.huurder : { ...huidig, naam: huidig.naam || g.huurder?.naam || "" } },
    foto: await huisfoto(inst),
    kenmerk: "Nagemaakt uit de oude administratie; dit is niet de oorspronkelijk verstuurde factuur.",
  })
}

/** Voegt de originele PDF toe aan een geïmporteerde factuur (eenmalig). */
export async function voegOrigineelToe(f: Factuur, bestand: File): Promise<Factuur> {
  const fd = new FormData()
  fd.append("pdf", bestand)
  return pb.collection("facturen").update<Factuur>(f.id, fd)
}

/** Zet de PDF van een definitieve factuur als kopie in Google Drive en onthoudt de link. */
export async function kopieNaarDrive(f: Factuur, inst: Instellingen, blob?: Blob): Promise<Factuur> {
  if (!f.nummer) throw new Error("Alleen definitieve facturen gaan naar Drive.")
  const inhoud = blob ?? (await (await fetch(await pdfUrl(f))).blob())
  // Naam van de huurder zonder aanhef, bijv. "2026-006 Anna de Vries.pdf".
  const naam = ((f.gegevens as FactuurGegevens | null)?.huurder?.naam ?? "").replace(/^(Dhr\.|Mevr\.|Fam\.)\s+/i, "")
  const bestand = await zetInDrive(factuurMap(inst.drive_map, f.nummer), factuurBestandsnaam(f.nummer, naam, f.soort === "credit"), inhoud)
  return pb.collection("facturen").update<Factuur>(f.id, { drive_id: bestand.id, drive_link: bestand.webViewLink })
}

/**
 * Definitief maken: factuurdatum op vandaag, nummer toekennen (backend),
 * PDF maken en opslaan. Daarna liggen inhoud en nummer vast.
 */
export async function maakDefinitief(f: Factuur, b: Boeking, inst: Instellingen): Promise<{ factuur: Factuur; driveMelding?: string }> {
  let concept = f
  if (f.soort === "factuur") concept = await vernieuwConcept(f, b, inst)
  else if (f.factuurdatum !== vandaag()) concept = await pb.collection("facturen").update<Factuur>(f.id, { factuurdatum: vandaag() })
  const genummerd = await pb.send<Factuur>(`/api/ducdalf/facturen/${concept.id}/nummeren`, { method: "POST" })
  const blob = await pdfVoor(genummerd, inst)
  const fd = new FormData()
  fd.append("pdf", new File([blob], `${genummerd.soort === "credit" ? "Creditfactuur" : "Factuur"}_${genummerd.nummer}.pdf`, { type: "application/pdf" }))
  let metPdf = await pb.collection("facturen").update<Factuur>(genummerd.id, fd)
  if (genummerd.soort === "factuur") {
    await pb.collection("boekingen").update(b.id, {
      // Is een aanbetaling omgezet naar één termijn (aankomst te dichtbij), dan ook in de boeking.
      betaalwijze: genummerd.aanbetaling_cent > 0 ? "aanbetaling" : "ineens",
      aanbetaling_vervaldatum: genummerd.aanbetaling_vervaldatum,
      rest_vervaldatum: genummerd.rest_vervaldatum,
    })
  }
  // Kopie naar Google Drive (mag mislukken: de factuur zelf staat veilig in de database).
  let driveMelding: string | undefined
  if (inst.drive_kopie) {
    if (!driveBeschikbaar()) {
      driveMelding = "Er is nog geen kopie in Google Drive gezet: Google is niet gekoppeld. Klik op ‘Naar Drive’ om het opnieuw te proberen."
    } else {
      try {
        metPdf = await kopieNaarDrive(metPdf, inst, blob)
      } catch (err) {
        driveMelding = `Kopie naar Google Drive mislukt: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }
  return { factuur: metPdf, driveMelding }
}

/** Markeer als verstuurd: vergrendelt de factuur en schuift de workflow door. */
export async function markeerVerstuurd(f: Factuur, b: Boeking, stappen: WorkflowStap[]): Promise<void> {
  await pb.collection("facturen").update(f.id, { vergrendeld: true, verstuurd_op: new Date().toISOString() })
  if (f.soort === "factuur" && b.status !== "geannuleerd" && !isBijOfVoorbij(stappen, b, "factuur_verstuurd")) {
    await pb.collection("boekingen").update(b.id, { status: "factuur_verstuurd" })
  }
}

export async function pdfUrl(f: Factuur): Promise<string> {
  const token = await pb.files.getToken()
  return pb.files.getURL(f, f.pdf, { token, download: false })
}

/**
 * Na een betaling: schuif de workflow door naar "Aanbetaling ontvangen" of
 * "Volledig betaald" als het betaalde bedrag dat rechtvaardigt.
 */
export function statusNaBetaling(
  b: Boeking,
  stappen: WorkflowStap[],
  facturen: Factuur[],
  betalingen: Betaling[],
): string | null {
  if (b.status === "geannuleerd") return null
  const definitief = facturen.filter((f) => f.boeking === b.id && f.nummer)
  if (definitief.length === 0) return null
  const totaal = definitief.reduce((t, f) => t + f.totaal_cent, 0)
  const betaald = betalingen.filter((p) => p.boeking === b.id).reduce((t, p) => t + p.bedrag_cent, 0)
  const actueel = definitief.filter((f) => f.soort === "factuur").at(-1)
  if (betaald >= totaal && totaal > 0 && !isBijOfVoorbij(stappen, b, "volledig_betaald")) return "volledig_betaald"
  if (
    b.betaalwijze === "aanbetaling" &&
    actueel &&
    betaald >= actueel.aanbetaling_cent &&
    betaald > 0 &&
    !isBijOfVoorbij(stappen, b, "aanbetaling_ontvangen")
  ) return "aanbetaling_ontvangen"
  return null
}
