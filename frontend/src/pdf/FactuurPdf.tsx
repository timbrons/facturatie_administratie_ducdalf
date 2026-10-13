import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import { formatLang } from "../domein/datum"
import { formatBedrag } from "../domein/geld"
import type { Factuurregel } from "../domein/factuur"

// Opmaak volgens de voorbeeldfactuur (2026-004): A4, marges 2,54 cm,
// huurder linksboven, accommodatie en afzender rechts, foto van het huis,
// tabel met nachten/personen/bedrag en de betaalinstructies onderaan.

export interface FactuurGegevens {
  huurder: { naam: string; adres: string; postcodePlaats: string; land?: string }
  afzender: { naam: string; adresregels: string[]; telefoon: string; email: string }
  accommodatie: string
  bank: { tnv: string; iban: string }
  aankomst: string
  vertrek: string
  betaaltekst: string
  creditVoor?: string
}

export interface FactuurPdfProps {
  nummer: string
  soort: "factuur" | "credit"
  factuurdatum: string
  regels: Factuurregel[]
  totaalCent: number
  gegevens: FactuurGegevens
  foto: string | null
  /** Opvallende regel bovenaan, bijv. bij een nagemaakte factuur uit de oude administratie */
  kenmerk?: string
}

// Geen automatische woordafbreking (zoals "perso-nen").
Font.registerHyphenationCallback((woord) => [woord])

const PT_PER_CM = 72 / 2.54

const s = StyleSheet.create({
  pagina: { paddingTop: 2.54 * PT_PER_CM, paddingBottom: 2.54 * PT_PER_CM, paddingHorizontal: 2.54 * PT_PER_CM, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.35, color: "#111111" },
  rij: { flexDirection: "row" },
  links: { width: "55%" },
  rechts: { width: "45%" },
  titel: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.1, marginBottom: 2 },
  kopje: { textDecoration: "underline", marginTop: 22, marginBottom: 10 },
  label: { width: 62 },
  tabel: { width: "85%", marginTop: 4 },
  tKop: { flexDirection: "row", paddingBottom: 4, borderBottomWidth: 0.8, borderBottomColor: "#111111" },
  tRij: { flexDirection: "row", paddingTop: 6 },
  tTotaal: { flexDirection: "row", marginTop: 18, paddingTop: 4, borderTopWidth: 0.8, borderTopColor: "#111111", fontFamily: "Helvetica-Bold" },
  cOms: { width: "40%", paddingRight: 6 },
  cNacht: { width: "14%" },
  cPers: { width: "18%", paddingRight: 6 },
  cBedrag: { width: "28%", flexDirection: "row", justifyContent: "space-between", paddingLeft: 4 },
  concept: { position: "absolute", top: 330, left: 60, fontSize: 90, color: "#e9e1d2", transform: "rotate(-30deg)", fontFamily: "Helvetica-Bold" },
})

function Bedrag({ cent }: { cent: number }) {
  return (
    <View style={s.cBedrag}>
      <Text>€</Text>
      <Text>{formatBedrag(cent)}</Text>
    </View>
  )
}

export function FactuurPdf({ nummer, soort, factuurdatum, regels, totaalCent, gegevens: g, foto, kenmerk }: FactuurPdfProps) {
  const credit = soort === "credit"
  return (
    <Document title={`${credit ? "Creditfactuur" : "Factuur"} ${nummer || "concept"}`} author={g.afzender.naam} language="nl">
      <Page size="A4" style={s.pagina}>
        {!nummer && <Text style={s.concept} fixed>CONCEPT</Text>}
        {kenmerk ? <Text style={{ marginBottom: 12, fontSize: 9, color: "#a4472d" }}>{kenmerk}</Text> : null}

        {/* Adresblokken */}
        <View style={s.rij}>
          <View style={s.links}>
            <Text>{g.huurder.naam}</Text>
            {g.huurder.adres ? <Text>{g.huurder.adres}</Text> : null}
            {g.huurder.postcodePlaats ? <Text>{g.huurder.postcodePlaats}</Text> : null}
            {g.huurder.land && g.huurder.land.toLowerCase() !== "nederland" ? <Text>{g.huurder.land}</Text> : null}
          </View>
          <View style={s.rechts}>
            <Text> </Text>
            <Text> </Text>
            <Text>{g.accommodatie}</Text>
            <Text> </Text>
            <Text>{g.afzender.naam}</Text>
            {g.afzender.adresregels.map((r, i) => <Text key={i}>{r}</Text>)}
            {g.afzender.telefoon ? <Text>Tel: {g.afzender.telefoon}</Text> : null}
            {g.afzender.email ? <Text>E-mail: {g.afzender.email}</Text> : null}
          </View>
        </View>

        {/* Datum, foto, titel */}
        <View style={[s.rij, { marginTop: 24 }]}>
          <View style={s.links}>
            <Text>Datum: {formatLang(factuurdatum)}</Text>
            <Text style={[s.titel, { marginTop: 44 }]}>{credit ? "Creditfactuur" : "Factuur"}</Text>
            <Text>Factuurnr: {nummer || "(concept)"}</Text>
            {credit && g.creditVoor ? <Text>Betreft factuur: {g.creditVoor}</Text> : null}
          </View>
          <View style={s.rechts}>
            {foto ? <Image src={foto} style={{ width: 200, height: 113, objectFit: "cover" }} /> : null}
          </View>
        </View>

        <Text style={s.kopje}>Huurperiode:</Text>
        <View style={s.rij}><Text style={s.label}>Aankomst:</Text><Text>{formatLang(g.aankomst)}</Text></View>
        <View style={s.rij}><Text style={s.label}>Vertrek:</Text><Text>{formatLang(g.vertrek)}</Text></View>

        <Text style={s.kopje}>Huurkosten:</Text>
        <View style={s.tabel}>
          <View style={s.tKop}>
            <Text style={s.cOms}> </Text>
            <Text style={s.cNacht}>Nachten</Text>
            <View style={s.cPers}><Text>Aantal</Text><Text>personen</Text></View>
            <View style={s.cBedrag}><Text>Bedrag</Text></View>
          </View>
          {regels.map((r, i) => (
            <View key={i} style={s.tRij} wrap={false}>
              <Text style={s.cOms}>{r.omschrijving}</Text>
              <Text style={s.cNacht}>{r.nachten ?? ""}</Text>
              <Text style={s.cPers}>{r.personen ?? ""}</Text>
              <Bedrag cent={r.bedrag_cent} />
            </View>
          ))}
          <View style={s.tTotaal} wrap={false}>
            <Text style={s.cOms}>Totaal</Text>
            <Text style={s.cNacht}> </Text>
            <Text style={s.cPers}> </Text>
            <Bedrag cent={totaalCent} />
          </View>
        </View>

        <View style={{ marginTop: 40 }} wrap={false}>
          {credit ? (
            <Text>Het bedrag van deze creditfactuur wordt naar u overgemaakt of verrekend.</Text>
          ) : (
            <>
              <Text>Betaling t.n.v. {g.bank.tnv}</Text>
              <Text>{g.bank.iban} o.v.v. het factuurnummer</Text>
              {/* Geen regelafbreking tussen € en het bedrag */}
              <Text style={{ marginTop: 12 }}>{g.betaaltekst.replace(/€ /g, "€\u00a0")}</Text>
            </>
          )}
        </View>
      </Page>
    </Document>
  )
}
