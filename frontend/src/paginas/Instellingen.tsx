import { formulierUrl } from "../lib/aanmeldingen"
import { useState } from "react"
import { Link } from "react-router-dom"
import { pb } from "../lib/pb"
import { sleutels, useInstellingen, useNummerreeksen, useOpslaan, useStappen } from "../lib/data"
import type { Instellingen, Nummerreeks, WorkflowStapRecord } from "../lib/types"
import { jaarVan, vandaag } from "../domein/datum"
import { volgendFactuurnummer } from "../domein/factuurnummer"
import type { Cent } from "../domein/geld"
import { VOORWAARDEN } from "../domein/workflow"
import { BedragVeld, Fout, Kaart, Laden, Melding, Paginakop, Veld } from "../components/ui"
import { GoogleKoppelingKaart } from "../components/GoogleKoppeling"

export function InstellingenPagina() {
  const inst = useInstellingen()
  if (inst.isLoading) return <Laden />
  if (inst.error) return <Fout fout={inst.error} />
  return (
    <>
      <Paginakop wenkbrauw="Beheer" titel="Instellingen">
        <Link to="/sjablonen" className="knop-rand">E-mailsjablonen</Link>
        <Link to="/beheer" className="knop-rand">Export en privacy</Link>
        <Link to="/importeren" className="knop-rand">Oude administratie importeren</Link>
      </Paginakop>
      <div className="flex flex-col gap-6">
        <GoogleKoppelingKaart afzender={inst.data!.afzender_email} />
        <Algemeen key={inst.data!.updated} inst={inst.data!} />
        <Bestanden inst={inst.data!} />
        <Nummering />
        <Workflow />
      </div>
    </>
  )
}

function Algemeen({ inst }: { inst: Instellingen }) {
  const opslaan = useOpslaan<Instellingen>("instellingen", [sleutels.instellingen])
  const [d, setD] = useState(inst)
  const [klaar, setKlaar] = useState(false)
  const tekst = (veld: keyof Instellingen, label: string, extra?: { type?: string; hint?: string; meerregelig?: boolean }) => (
    <Veld label={label} hint={extra?.hint}>
      {extra?.meerregelig ? (
        <textarea rows={3} value={String(d[veld] ?? "")} onChange={(e) => setD({ ...d, [veld]: e.target.value })} />
      ) : (
        <input type={extra?.type ?? "text"} value={String(d[veld] ?? "")} onChange={(e) => setD({ ...d, [veld]: e.target.value })} />
      )}
    </Veld>
  )
  const getal = (veld: keyof Instellingen, label: string, hint?: string) => (
    <Veld label={label} hint={hint}>
      <input type="number" min={0} value={Number(d[veld] ?? 0)} onChange={(e) => setD({ ...d, [veld]: Number(e.target.value) })} />
    </Veld>
  )
  const bedrag = (veld: keyof Instellingen, label: string, hint?: string) => (
    <Veld label={label} hint={hint}>
      <BedragVeld waarde={d[veld] as Cent} onChange={(c) => setD({ ...d, [veld]: c ?? 0 })} />
    </Veld>
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setKlaar(false)
        // Bestandsvelden worden apart beheerd.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { brochure, huisfoto, id, collectionId, collectionName, created, updated, ...rest } = d
        opslaan.mutate({ id: inst.id, data: rest }, { onSuccess: () => setKlaar(true) })
      }}
      className="flex flex-col gap-6"
    >
      <Kaart titel="Afzender op de factuur">
        <div className="grid gap-4 sm:grid-cols-2">
          {tekst("afzender_naam", "Naam", { hint: "Bijv. Familie Brons" })}
          {tekst("accommodatie_naam", "Accommodatie")}
          {tekst("afzender_adres", "Adres", { meerregelig: true, hint: "Straat en huisnummer, postcode en plaats op aparte regels" })}
          <div className="flex flex-col gap-4">
            {tekst("afzender_telefoon", "Telefoon")}
            {tekst("afzender_email", "E-mail", { type: "email" })}
          </div>
        </div>
      </Kaart>

      <Kaart titel="Bank">
        <div className="grid gap-4 sm:grid-cols-2">
          {tekst("bank_tnv", "Ten name van")}
          {tekst("bank_iban", "IBAN")}
        </div>
        <p className="mt-2 text-xs text-zacht">Deze gegevens staan alleen in de database op de NAS, niet in de code.</p>
      </Kaart>

      <Kaart titel="Vaste kosten en regels">
        <div className="grid gap-4 sm:grid-cols-3">
          {bedrag("schoonmaak_cent", "Eindschoonmaak")}
          {bedrag("parkkosten_per_nacht_cent", "Parkkosten per nacht", "Zitten in de seizoensprijs")}
          <label className="flex items-center gap-2 pt-6 text-inkt">
            <input type="checkbox" checked={d.parkkosten_apart_op_factuur} onChange={(e) => setD({ ...d, parkkosten_apart_op_factuur: e.target.checked })} />
            Parkkosten apart op de factuur
          </label>
          {getal("min_nachten", "Minimum aantal nachten")}
          {getal("max_personen", "Maximum aantal personen")}
          {getal("bewaartermijn_jaren", "Bewaartermijn persoonsgegevens (jaren)")}
        </div>
      </Kaart>

      <Kaart titel="Betaaltermijnen en herinneringen">
        <div className="grid gap-4 sm:grid-cols-3">
          {getal("aanbetaling_pct", "Standaard aanbetaling (%)")}
          {getal("aanbetaling_termijn_maanden", "Aanbetaling binnen (maanden na factuurdatum)")}
          {getal("rest_weken_voor_aankomst", "Restbetaling (weken vóór aankomst)")}
          {getal("herinnering_rest_dagen", "Waarschuwen bij betaling binnen (dagen)")}
          {getal("aankomst_vooruit_dagen", "Aankomsten tonen binnen (dagen)")}
          {getal("tb_aangifte_dag", "Aangifte toeristenbelasting uiterlijk dag", "Van de maand na het verblijf")}
        </div>
      </Kaart>

      <Kaart titel="Google Drive">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 pt-6 text-inkt">
            <input type="checkbox" checked={d.drive_kopie} onChange={(e) => setD({ ...d, drive_kopie: e.target.checked })} />
            Kopie van facturen en bewijsstukken in Google Drive zetten
          </label>
          {tekst("drive_map", "Hoofdmap in Google Drive", { hint: "Daaronder: Facturen/<jaar> en Toeristenbelasting/<jaar>" })}
        </div>
      </Kaart>

      <Kaart titel="Google Agenda">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 pt-6 text-inkt sm:col-span-2">
            <input type="checkbox" checked={d.agenda_tonen ?? false} onChange={(e) => setD({ ...d, agenda_tonen: e.target.checked })} />
            Eigen verblijven uit Google Agenda tonen in de kalender
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-inkt">
              <input type="checkbox" checked={d.agenda_boekingen ?? false} onChange={(e) => setD({ ...d, agenda_boekingen: e.target.checked })} />
              Huurboekingen automatisch in Google Agenda zetten
            </label>
            <p className="text-xs text-zacht">
              Elke boeking die niet geannuleerd is, staat als afspraak van de aankomst- tot en met de vertrekdag in de agenda hieronder
              ("Verhuur – naam"). Wijzigingen en annuleringen worden direct overgenomen; elke 10 minuten wordt alles nagelopen.
            </p>
            <AgendaNuBijwerken />
          </div>
          {tekst("agenda_id", "Agenda", { hint: '"primary" is de hoofdagenda van het gekoppelde account; een andere agenda vind je in Google Agenda bij Instellingen → Agenda-ID' })}
          {tekst("agenda_filter", "Alleen afspraken met in de titel", { hint: 'Bijv. "eigen, familie" (gescheiden door komma\'s). Leeg = alle afspraken van minstens één nacht' })}
          <div className="sm:col-span-2">
            {tekst("eigen_verblijf_groepen", "Gezinnen voor een eigen verblijf", {
              meerregelig: true,
              hint: "Eén gezin per regel. Bij een eigen verblijf kies je voor wie het is; dat komt in de titel en de kleur van de afspraak in Google Agenda.",
            })}
          </div>
        </div>
      </Kaart>

      <Kaart titel="Links">
        <div className="grid gap-4 sm:grid-cols-2">
          {tekst("tb_portaal_url", "Portaal toeristenbelasting", { type: "url" })}
          {tekst("pld_portaal_url", "Portaal Parc le Duc (aanmelden huurders)", { type: "url" })}
          {tekst("aanmeldformulier_url", "Aanmeldformulier", { type: "url", hint: `Leeg = het formulier van deze app (${formulierUrl()})` })}
        </div>
      </Kaart>

      {opslaan.error ? <Fout fout={opslaan.error} /> : null}
      {klaar && <Melding soort="succes">Instellingen opgeslagen.</Melding>}
      <div className="flex justify-end">
        <button type="submit" className="knop" disabled={opslaan.isPending}>Instellingen opslaan</button>
      </div>
    </form>
  )
}

function Bestanden({ inst }: { inst: Instellingen }) {
  const opslaan = useOpslaan<Instellingen>("instellingen", [sleutels.instellingen])
  function upload(veld: "brochure" | "huisfoto", file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append(veld, file)
    opslaan.mutate({ id: inst.id, data: fd })
  }
  async function open(veld: "brochure" | "huisfoto") {
    const token = await pb.files.getToken()
    window.open(pb.files.getURL(inst, inst[veld], { token }), "_blank", "noopener")
  }
  return (
    <Kaart titel="Bestanden">
      <div className="grid gap-4 sm:grid-cols-2">
        <Veld label="Informatiebrochure (PDF)" hint={inst.brochure ? <button type="button" className="underline" onClick={() => open("brochure")}>Huidige brochure bekijken</button> : "Nog niet geüpload"}>
          <input type="file" accept="application/pdf" onChange={(e) => upload("brochure", e.target.files?.[0])} />
        </Veld>
        <Veld label="Foto van het huis (voor de factuur)" hint={inst.huisfoto ? <button type="button" className="underline" onClick={() => open("huisfoto")}>Huidige foto bekijken</button> : "Nog niet geüpload"}>
          <input type="file" accept="image/jpeg,image/png" onChange={(e) => upload("huisfoto", e.target.files?.[0])} />
        </Veld>
      </div>
      {opslaan.isPending && <p className="mt-2 text-sm text-zacht">Uploaden…</p>}
      {opslaan.error ? <div className="mt-2"><Fout fout={opslaan.error} /></div> : null}
    </Kaart>
  )
}

function Nummering() {
  const reeksen = useNummerreeksen()
  const opslaan = useOpslaan<Nummerreeks>("nummerreeksen", [sleutels.nummerreeksen])
  const [jaar, setJaar] = useState(jaarVan(vandaag()))
  const [laatste, setLaatste] = useState<number | "">("")
  if (reeksen.isLoading) return <Laden />
  const bestaand = (reeksen.data ?? []).find((r) => r.jaar === jaar)
  return (
    <Kaart titel="Factuurnummering">
      <p className="mb-3 text-sm text-zacht">Nummers lopen per jaar door: JJJJ-NNN. Stel hier het laatst uitgegeven nummer in, zodat de reeks daarna verder gaat.</p>
      <ul className="mb-4 text-sm">
        {(reeksen.data ?? []).map((r) => (
          <li key={r.id}>{r.jaar}: laatste {String(r.laatste).padStart(3, "0")} → volgende <strong>{volgendFactuurnummer(r.jaar, r.laatste)}</strong></li>
        ))}
        {(reeksen.data ?? []).length === 0 && <li className="text-zacht">Nog geen reeksen ingesteld.</li>}
      </ul>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Veld label="Jaar"><input type="number" value={jaar} onChange={(e) => setJaar(Number(e.target.value))} /></Veld>
        <Veld label="Laatst uitgegeven volgnummer" hint={bestaand ? `Nu: ${bestaand.laatste}` : undefined}>
          <input type="number" min={0} value={laatste} onChange={(e) => setLaatste(e.target.value === "" ? "" : Number(e.target.value))} />
        </Veld>
        <button
          type="button"
          className="knop"
          disabled={laatste === ""}
          onClick={() => {
            if (bestaand && Number(laatste) < bestaand.laatste && !window.confirm("Het nummer lager zetten kan dubbele factuurnummers geven. Doorgaan?")) return
            opslaan.mutate({ id: bestaand?.id, data: { jaar, laatste } }, { onSuccess: () => setLaatste("") })
          }}
        >
          Opslaan
        </button>
      </div>
      {opslaan.error ? <div className="mt-2"><Fout fout={opslaan.error} /></div> : null}
    </Kaart>
  )
}

function Workflow() {
  const stappen = useStappen()
  if (stappen.isLoading) return <Laden />
  return (
    <Kaart titel="Workflow">
      <p className="mb-4 text-sm text-zacht">
        Pas teksten en volgorde van de stappen aan. Een stap uitzetten haalt hem uit de workflow. De sleutel is vast, omdat de app er logica aan koppelt.
      </p>
      <div className="flex flex-col gap-2">
        {(stappen.data ?? []).map((s) => <StapRij key={s.id} stap={s} />)}
      </div>
    </Kaart>
  )
}

function StapRij({ stap }: { stap: WorkflowStapRecord }) {
  const opslaan = useOpslaan<WorkflowStapRecord>("workflow_stappen", [sleutels.stappen])
  const [d, setD] = useState({ label: stap.label, actie_label: stap.actie_label, omschrijving: stap.omschrijving, volgorde: stap.volgorde, overslaan_als: stap.overslaan_als, actief: stap.actief })
  const gewijzigd = JSON.stringify(d) !== JSON.stringify({ label: stap.label, actie_label: stap.actie_label, omschrijving: stap.omschrijving, volgorde: stap.volgorde, overslaan_als: stap.overslaan_als, actief: stap.actief })
  return (
    <details className="border border-lijn bg-white">
      <summary className="cursor-pointer px-3 py-2 text-inkt">
        <span className="mr-2 text-xs text-zacht">{d.volgorde}</span>
        {d.label} {!d.actief && <span className="text-xs text-zacht">(uit)</span>}
      </summary>
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        <Veld label="Naam van de status"><input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} /></Veld>
        <Veld label="Knoptekst (actie)"><input value={d.actie_label} onChange={(e) => setD({ ...d, actie_label: e.target.value })} /></Veld>
        <Veld label="Omschrijving" className="sm:col-span-2"><input value={d.omschrijving} onChange={(e) => setD({ ...d, omschrijving: e.target.value })} /></Veld>
        <Veld label="Volgorde"><input type="number" value={d.volgorde} onChange={(e) => setD({ ...d, volgorde: Number(e.target.value) })} /></Veld>
        <Veld label="Automatisch overslaan">
          <select value={d.overslaan_als} onChange={(e) => setD({ ...d, overslaan_als: e.target.value })}>
            <option value="">Nooit</option>
            {Object.entries(VOORWAARDEN).map(([k, v]) => <option key={k} value={k}>{v.omschrijving}</option>)}
          </select>
        </Veld>
        <label className="flex items-center gap-2 text-inkt">
          <input type="checkbox" checked={d.actief} onChange={(e) => setD({ ...d, actief: e.target.checked })} /> Actief
        </label>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <span className="mr-auto text-xs text-zacht">Sleutel: {stap.sleutel}</span>
          {opslaan.error ? <Fout fout={opslaan.error} /> : null}
          <button type="button" className="knop" disabled={!gewijzigd || opslaan.isPending} onClick={() => opslaan.mutate({ id: stap.id, data: d })}>Opslaan</button>
        </div>
      </div>
    </details>
  )
}

function AgendaNuBijwerken() {
  const [bezig, setBezig] = useState(false)
  const [uitkomst, setUitkomst] = useState<string>("")
  const [fout, setFout] = useState<unknown>(null)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="knop-klein"
        disabled={bezig}
        onClick={async () => {
          setBezig(true)
          setFout(null)
          setUitkomst("")
          try {
            const t = await pb.send<{ actief: boolean; gezet: number; verwijderd: number; ongewijzigd: number; fouten: number }>("/api/ducdalf/agenda/boekingen", { method: "POST" })
            setUitkomst(
              t.actief
                ? `Klaar: ${t.gezet} toegevoegd of bijgewerkt, ${t.verwijderd} verwijderd, ${t.ongewijzigd} al goed${t.fouten ? `, ${t.fouten} mislukt` : ""}.`
                : "Niet gedaan: zet de optie hierboven aan (en sla op) en controleer de Google-koppeling met agendarechten.",
            )
          } catch (err) {
            setFout(err)
          } finally {
            setBezig(false)
          }
        }}
      >
        {bezig ? "Bezig…" : "Nu bijwerken"}
      </button>
      {uitkomst && <span className="text-sm text-zacht">{uitkomst}</span>}
      {fout ? <Fout fout={fout} /> : null}
    </div>
  )
}
