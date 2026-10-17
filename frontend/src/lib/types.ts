import type { RecordModel } from "pocketbase"
import type { Cent } from "../domein/geld"
import type { ExtraEenheid, ExtraRegel } from "../domein/prijs"

export type Taal = "nl" | "en" | "fr" | "de"

export interface Instellingen extends RecordModel {
  agenda_tonen: boolean
  agenda_boekingen: boolean
  agenda_id: string
  agenda_filter: string
  afzender_naam: string
  afzender_adres: string
  afzender_telefoon: string
  afzender_email: string
  accommodatie_naam: string
  bank_tnv: string
  bank_iban: string
  schoonmaak_cent: Cent
  parkkosten_per_nacht_cent: Cent
  parkkosten_apart_op_factuur: boolean
  min_nachten: number
  max_personen: number
  aanbetaling_pct: number
  aanbetaling_termijn_maanden: number
  rest_weken_voor_aankomst: number
  herinnering_rest_dagen: number
  aankomst_vooruit_dagen: number
  tb_aangifte_dag: number
  tb_portaal_url: string
  pld_portaal_url: string
  /** Gezinnen voor een eigen verblijf, één per regel */
  eigen_verblijf_groepen: string
  aanmeldformulier_url: string
  bewaartermijn_jaren: number
  brochure: string
  huisfoto: string
  drive_kopie: boolean
  drive_map: string
}

export interface AanmeldingRecord extends RecordModel {
  status: "nieuw" | "gekoppeld" | "verwerkt"
  velden: Record<string, string> | null
  naam: string
  email: string
  aankomst: string
  vertrek: string
  boekingscode: string
  toelichting: string
  boeking: string
}

export interface SeizoenRecord extends RecordModel {
  jaar: number
  naam: string
  van: string
  tot: string
  prijs_per_nacht_cent: Cent
  min_nachten: number
}

export interface ExtraRecord extends RecordModel {
  naam: string
  omschrijving: string
  prijs_cent: Cent
  eenheid: ExtraEenheid
  actief: boolean
  volgorde: number
}

export interface TbTariefRecord extends RecordModel {
  geldig_vanaf: string
  omschrijving: string
  percentage_bp: number
  plafond_cent: Cent
  opslagen: { naam: string; bp: number }[] | null
  volwassen_vanaf_leeftijd: number
}

export interface Huurder extends RecordModel {
  aanhef: string
  voornaam: string
  achternaam: string
  email: string
  telefoon_mobiel: string
  telefoon_vast: string
  adres: string
  postcode: string
  plaats: string
  land: string
  kenteken: string
  taal: Taal | ""
  notities: string
  geanonimiseerd_op: string
  /** Meldingen van nieuwe mails van deze huurder tot dit tijdstip zijn afgehandeld (ISO) */
  mail_gezien_tot?: string
}

export interface WorkflowStapRecord extends RecordModel {
  sleutel: string
  label: string
  actie_label: string
  omschrijving: string
  volgorde: number
  overslaan_als: string
  actief: boolean
}

export interface Boeking extends RecordModel {
  code: string
  huurder: string
  aankomst: string
  vertrek: string
  volwassenen: number
  kinderen: number
  kenteken: string
  bron: string
  taal: Taal | ""
  optie: boolean
  status: string
  status_sinds: string
  geannuleerd_reden: string
  huur_cent: Cent
  huur_berekend_cent: Cent
  huur_handmatig: boolean
  parkkosten_cent: Cent
  schoonmaak_cent: Cent
  extras: ExtraRegel[] | null
  tb_berekend_cent: Cent
  tb_portaal_cent: Cent
  tb_portaal_op: string
  betaalwijze: "ineens" | "aanbetaling" | ""
  aanbetaling_pct: number
  aanbetaling_vervaldatum: string
  rest_vervaldatum: string
  tb_aangifte: string
  /** Werkelijk aan Parc le Duc betaalde parkkosten */
  parkkosten_betaald_cent: Cent
  parkkosten_betaald_op: string
  /** Factuur van PLD (bestandsnaam) */
  parkkosten_factuur: string
  /** Kopie van de factuur van PLD in Google Drive */
  parkkosten_drive_id: string
  parkkosten_drive_link: string
  tb_definitief_volwassenen: number
  tb_definitief_kinderen: number
  tb_aangegeven_cent: Cent
  tb_aangegeven_op: string
  aanmelding: Record<string, unknown> | null
  aanmelding_op: string
  notities: string
  expand?: { huurder?: Huurder }
}

export interface Statuswijziging extends RecordModel {
  boeking: string
  van: string
  naar: string
  door: string
  opmerking: string
}

export interface Nummerreeks extends RecordModel {
  jaar: number
  laatste: number
}

/** Weergavenaam van een huurder, bijv. "Jan de Vries". */
export function huurderNaam(h: Pick<Huurder, "voornaam" | "achternaam"> | null | undefined): string {
  if (!h) return "(geen huurder)"
  const naam = [h.voornaam, h.achternaam].filter(Boolean).join(" ").trim()
  return naam || "(naamloos)"
}

export function boekingNaam(b: Boeking): string {
  return huurderNaam(b.expand?.huurder)
}

export interface Factuur extends RecordModel {
  boeking: string
  nummer: string
  soort: "factuur" | "credit"
  factuurdatum: string
  regels: import("../domein/factuur").Factuurregel[] | null
  gegevens: import("../pdf/FactuurPdf").FactuurGegevens | null
  totaal_cent: Cent
  aanbetaling_cent: Cent
  aanbetaling_vervaldatum: string
  rest_vervaldatum: string
  pdf: string
  verstuurd_op: string
  vergrendeld: boolean
  verwijst_naar: string
  geimporteerd: boolean
  drive_id: string
  drive_link: string
  /** Datum waarop de factuur is geannuleerd ("" = geldig) */
  geannuleerd_op: string
  /** Concept met de hand aangepast: volgt de boeking niet meer automatisch */
  aangepast: boolean
}

export interface Betaling extends RecordModel {
  boeking: string
  factuur: string
  datum: string
  bedrag_cent: Cent
  soort: "aanbetaling" | "rest" | "volledig" | "terugbetaling" | "overig"
  opmerking: string
  geimporteerd: boolean
}

export interface TbAangifte extends RecordModel {
  periode: string
  ingediend_op: string
  aangegeven_cent: Cent
  referentie: string
  bewijs: string[]
  afgedragen_op: string
  afgedragen_cent: Cent
  notities: string
}

export interface MailSjabloon extends RecordModel {
  sleutel: string
  taal: Taal
  naam: string
  onderwerp: string
  tekst: string
  bijlagen: ("brochure" | "factuur")[]
}

export interface MailLog extends RecordModel {
  boeking: string
  aan: string
  onderwerp: string
  tekst: string
  bijlagen: string[] | null
  sjablonen: string[] | null
  gmail_message_id: string
  gmail_thread_id: string
  message_id: string
  status_na: string
}
