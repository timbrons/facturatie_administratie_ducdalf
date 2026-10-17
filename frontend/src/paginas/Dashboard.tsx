import { Link } from "react-router-dom"
import { useMemo } from "react"
import { sleutels, useAanmeldingen, useBoekingen, useHuurders, useInstellingen, useMaillog, useStappen } from "../lib/data"
import { useNieuweMails } from "../lib/mailgesprek"
import { pb } from "../lib/pb"
import { useQueryClient } from "@tanstack/react-query"
import { boekingNaam } from "../lib/types"
import { isActief } from "../lib/boeking"
import { bouwActielijst, type Urgentie } from "../domein/actielijst"
import { formatMiddel, formatTijdstip, plusDagen, vandaag } from "../domein/datum"
import { Fout, Kaart, Laden, Paginakop } from "../components/ui"
import { StatusLabel } from "../components/Status"

const KLEUR: Record<Urgentie, string> = {
  rood: "border-l-rood bg-rood-zacht",
  oranje: "border-l-oranje bg-oranje-zacht",
  normaal: "border-l-olijf bg-white/70",
}

export function Dashboard() {
  const boekingen = useBoekingen()
  const stappen = useStappen()
  const inst = useInstellingen()
  const maillog = useMaillog()
  const aanmeldingen = useAanmeldingen()
  const huurders = useHuurders()
  const qc = useQueryClient()
  const nu = vandaag()
  // Huurders met een lopende of recente boeking (tot 60 dagen na vertrek): nieuwe mails van hen melden.
  const relevant = useMemo(() => {
    const ids = new Set((boekingen.data ?? []).filter((b) => b.status !== "geannuleerd" && b.vertrek >= plusDagen(nu, -60)).map((b) => b.huurder))
    return (huurders.data ?? []).filter((h) => ids.has(h.id) && h.email && !h.geanonimiseerd_op)
  }, [boekingen.data, huurders.data, nu])
  const nieuweMails = useNieuweMails(relevant, maillog.data ?? [], !!maillog.data)
  /** De boeking waar een mail van deze huurder het best bij past: de eerstvolgende lopende, anders de laatste. */
  const boekingVoor = (huurderId: string) => {
    const eigen = (boekingen.data ?? []).filter((b) => b.huurder === huurderId && b.status !== "geannuleerd")
    return eigen.filter((b) => b.vertrek >= nu).sort((a, b) => a.aankomst.localeCompare(b.aankomst))[0] ?? eigen.sort((a, b) => b.aankomst.localeCompare(a.aankomst))[0]
  }

  const acties = useMemo(() => {
    if (!boekingen.data || !stappen.data || !inst.data) return []
    return bouwActielijst(
      boekingen.data.map((b) => ({ ...b, naam: boekingNaam(b) })),
      stappen.data,
      inst.data,
      nu,
      (maillog.data ?? []).map((m) => ({ boekingId: m.boeking, sjablonen: m.sjablonen ?? [], datum: m.created.slice(0, 10) })),
    )
  }, [boekingen.data, stappen.data, inst.data, maillog.data, nu])

  if (boekingen.isLoading || stappen.isLoading || inst.isLoading) return <Laden />
  const fout = boekingen.error || stappen.error || inst.error
  if (fout) return <Fout fout={fout} />

  const alle = boekingen.data ?? []
  const nieuweAanmeldingen = (aanmeldingen.data ?? []).filter((a) => a.status === "nieuw")
  const komend = alle.filter((b) => isActief(b) && b.vertrek >= nu).slice(0, 6)

  return (
    <>
      <Paginakop wenkbrauw={`Vandaag, ${formatMiddel(nu)}`} titel="Acties">
        <Link to="/boekingen/nieuw" className="knop sm:hidden">Nieuwe boeking</Link>
      </Paginakop>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(nieuweMails.data ?? []).length > 0 && (
            <ul className="mb-2 flex flex-col gap-2">
              {(nieuweMails.data ?? []).map((m) => {
                const b = boekingVoor(m.huurder.id)
                const naam = [m.huurder.voornaam, m.huurder.achternaam].filter(Boolean).join(" ") || m.adres
                return (
                  <li key={m.adres}>
                    <div className={`flex flex-col gap-2 border border-lijn border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${KLEUR.oranje}`}>
                      <Link to={b ? `/boekingen/${b.id}` : `/huurders/${m.huurder.id}`} className="no-underline">
                        <div className="font-medium text-inkt">Nieuwe mail van {naam}{m.aantal > 1 ? ` (${m.aantal})` : ""}</div>
                        <div className="text-sm text-tekst">"{m.onderwerp || "(geen onderwerp)"}" · {formatTijdstip(m.tijd)} · nog niet beantwoord</div>
                      </Link>
                      <button
                        type="button"
                        className="knop-klein shrink-0 self-start sm:self-center"
                        title="Verberg deze melding tot er een nieuwe mail binnenkomt (bijv. als je telefonisch hebt gereageerd)"
                        onClick={async () => {
                          await pb.collection("huurders").update(m.huurder.id, { mail_gezien_tot: m.tijd })
                          await qc.invalidateQueries({ queryKey: sleutels.huurders })
                        }}
                      >
                        Afgehandeld
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {nieuweAanmeldingen.length > 0 && (
            <ul className="mb-2 flex flex-col gap-2">
              {nieuweAanmeldingen.map((a) => (
                <li key={a.id}>
                  <Link to="/aanmeldingen" className={`flex flex-col border border-lijn border-l-4 px-4 py-3 no-underline ${KLEUR.oranje}`}>
                    <span className="font-medium text-inkt">Nieuwe aanmelding – {a.naam}</span>
                    <span className="text-sm text-tekst">{formatMiddel(a.aankomst)} – {formatMiddel(a.vertrek)} · controleren en overnemen</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {acties.length === 0 && nieuweAanmeldingen.length === 0 && (nieuweMails.data ?? []).length === 0 ? (
            <div className="infoblok">Er staat niets open. Alles is bijgewerkt.</div>
          ) : acties.length === 0 ? null : (
            <ul className="flex flex-col gap-2">
              {acties.map((a, i) => (
                <li key={`${a.boekingId}-${a.soort}-${i}`}>
                  <div className={`flex flex-col gap-2 border border-lijn border-l-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${a.wachten ? "border-l-lijn bg-transparent" : KLEUR[a.urgentie]}`}>
                    <Link to={`/boekingen/${a.boekingId}`} className="no-underline">
                      {a.afgerond && (
                        <div className="mb-0.5 text-xs text-olijf-donker">✓ Afgerond: {a.afgerond}</div>
                      )}
                      <div className={a.wachten ? "text-zacht" : "font-medium text-inkt"}>
                        {a.afgerond && !a.wachten && <span className="font-normal text-zacht">Volgende stap: </span>}
                        {a.titel}
                      </div>
                      {a.toelichting && <div className="text-sm text-tekst">{a.toelichting}</div>}
                    </Link>
                    {a.stap === "le_duc_aangemeld" && inst.data?.pld_portaal_url && (
                      <a href={inst.data.pld_portaal_url} target="_blank" rel="noopener noreferrer" className="knop-klein shrink-0 self-start sm:self-center">
                        Open PLD-portaal ↗
                      </a>
                    )}
                    {a.mail && (
                      <Link to={`/boekingen/${a.boekingId}?mail=${a.mail}`} className="knop-klein shrink-0 self-start sm:self-center">
                        {a.mail === "fijne_reis" ? "Mail opstellen" : "Herinnering sturen"}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <img
            src={`${import.meta.env.BASE_URL}inloggen.jpg`}
            alt="Vakantiehuis Duc’dalf"
            className="aspect-[4/3] w-full border border-lijn object-cover object-[50%_48%]"
          />

          <Kaart titel="Komende verblijven" actie={<Link to="/kalender" className="text-sm">Kalender</Link>}>
            {komend.length === 0 ? (
              <p className="text-sm text-zacht">Geen komende verblijven.</p>
            ) : (
              <ul className="divide-y divide-lijn">
                {komend.map((b) => (
                  <li key={b.id} className="py-2">
                    <Link to={`/boekingen/${b.id}`} className="flex flex-col no-underline">
                      <span className="text-inkt">{boekingNaam(b)}</span>
                      <span className="text-xs text-zacht">{formatMiddel(b.aankomst)} – {formatMiddel(b.vertrek)}</span>
                      <span className="mt-1"><StatusLabel status={b.status} stappen={stappen.data ?? []} optie={b.optie} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Kaart>
        </div>
      </div>
    </>
  )
}
