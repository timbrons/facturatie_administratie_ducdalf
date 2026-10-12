import { pb } from "./pb"
import { csvBedrag, schrijfCsv } from "../domein/csv"
import { veiligeNaam } from "../domein/bestandsnamen"
import { vandaag } from "../domein/datum"
import type { RecordModel } from "pocketbase"

// "Exporteer alles": alle gegevens als JSON, de belangrijkste lijsten als CSV
// en alle bestanden (factuur-PDF's, bewijsstukken, brochure) in één zip.

const COLLECTIES = [
  "instellingen", "seizoenen", "extras", "tb_tarieven", "workflow_stappen", "huurders", "boekingen",
  "statuswijzigingen", "facturen", "nummerreeksen", "betalingen", "tb_aangiften", "mail_sjablonen", "mail_log",
]
const BESTANDSVELDEN: Record<string, string[]> = { facturen: ["pdf"], tb_aangiften: ["bewijs"], instellingen: ["brochure", "huisfoto"] }

export async function exporteerAlles(voortgang: (tekst: string) => void): Promise<Blob> {
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  const data: Record<string, RecordModel[]> = {}
  for (const c of COLLECTIES) {
    voortgang(`Gegevens ophalen: ${c}`)
    data[c] = await pb.collection(c).getFullList({ sort: "created" })
    zip.file(`gegevens/${c}.json`, JSON.stringify(data[c], null, 2))
  }

  const huurder = (id: string) => data.huurders.find((h) => h.id === id)
  const naam = (id: string) => { const h = huurder(id); return h ? `${h.voornaam} ${h.achternaam}`.trim() : "" }
  const boeking = (id: string) => data.boekingen.find((b) => b.id === id)
  zip.file("overzichten/boekingen.csv", schrijfCsv([
    ["Huurder", "E-mail", "Aankomst", "Vertrek", "Volwassenen", "Kinderen", "Kenteken", "Status", "Huur", "Parkkosten", "Schoonmaak", "Toeristenbelasting (portaal)"],
    ...data.boekingen.map((b) => [naam(b.huurder), huurder(b.huurder)?.email ?? "", b.aankomst, b.vertrek, b.volwassenen, b.kinderen, b.kenteken, b.status,
      csvBedrag(b.huur_cent), csvBedrag(b.parkkosten_cent), csvBedrag(b.schoonmaak_cent), b.tb_portaal_op ? csvBedrag(b.tb_portaal_cent) : ""]),
  ]))
  zip.file("overzichten/facturen.csv", schrijfCsv([
    ["Nummer", "Soort", "Factuurdatum", "Huurder", "Aankomst", "Totaal", "Verstuurd"],
    ...data.facturen.filter((f) => f.nummer).map((f) => [f.nummer, f.soort, f.factuurdatum, naam(boeking(f.boeking)?.huurder ?? ""), boeking(f.boeking)?.aankomst ?? "", csvBedrag(f.totaal_cent), String(f.verstuurd_op ?? "").slice(0, 10)]),
  ]))
  zip.file("overzichten/betalingen.csv", schrijfCsv([
    ["Datum", "Huurder", "Soort", "Bedrag", "Opmerking"],
    ...data.betalingen.map((p) => [p.datum, naam(boeking(p.boeking)?.huurder ?? ""), p.soort, csvBedrag(p.bedrag_cent), p.opmerking]),
  ]))
  zip.file("overzichten/huurders.csv", schrijfCsv([
    ["Aanhef", "Voornaam", "Achternaam", "E-mail", "Telefoon", "Adres", "Postcode", "Plaats", "Land", "Kenteken"],
    ...data.huurders.map((h) => [h.aanhef, h.voornaam, h.achternaam, h.email, h.telefoon_mobiel, h.adres, h.postcode, h.plaats, h.land, h.kenteken]),
  ]))

  const token = await pb.files.getToken()
  for (const [c, velden] of Object.entries(BESTANDSVELDEN)) {
    for (const r of data[c]) {
      for (const veld of velden) {
        const waarde = r[veld]
        for (const bestand of Array.isArray(waarde) ? waarde : waarde ? [waarde] : []) {
          voortgang(`Bestand ophalen: ${bestand}`)
          const res = await fetch(pb.files.getURL(r, bestand, { token }))
          if (!res.ok) continue
          const voorvoegsel = c === "facturen" ? `${r.nummer} ` : c === "tb_aangiften" ? `${r.periode} ` : ""
          zip.file(`bestanden/${c}/${veiligeNaam(voorvoegsel + bestand)}`, await res.blob())
        }
      }
    }
  }
  zip.file("LEESMIJ.txt",
    `Export van het verhuurbeheer Duc'dalf, gemaakt op ${vandaag()}.\r\n\r\n` +
    "gegevens/     alle tabellen als JSON (volledig)\r\n" +
    "overzichten/  boekingen, facturen, betalingen en huurders als CSV (Excel)\r\n" +
    "bestanden/    factuur-PDF's, bewijsstukken toeristenbelasting, brochure en huisfoto\r\n\r\n" +
    "Let op: dit bestand bevat persoonsgegevens. Bewaar het veilig en zet het nooit in de repository.\r\n")
  voortgang("Zip maken…")
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" })
}
