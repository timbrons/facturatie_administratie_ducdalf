import { useEffect, useState } from "react"
import { pb } from "../lib/pb"
import { haalServerToken, ontkoppelGmail, SCOPES } from "../lib/gmail"
import { useQueryClient } from "@tanstack/react-query"
import { formatTijdstip } from "../domein/datum"
import { Fout, Kaart, Melding } from "./ui"

interface Status { gekoppeld: boolean; email: string; gekoppeld_op: string; gekoppeld_door: string; scopes?: string }

function openVenster(): Window | null {
  const b = Math.min(1024, window.innerWidth)
  const h = Math.min(768, window.innerHeight)
  return window.open("", "google_koppelen", `width=${b},height=${h},top=${window.innerHeight / 2 - h / 2},left=${window.innerWidth / 2 - b / 2},resizable,menubar=no`)
}

/**
 * Vaste koppeling met het Google-account van de afzender. Eenmalig koppelen;
 * daarna gebruikt iedereen die in de app is ingelogd Gmail en Drive van dat
 * account, zonder Google-venster. De blijvende sleutel staat alleen op de NAS.
 */
export function GoogleKoppelingKaart({ afzender }: { afzender: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [fout, setFout] = useState<unknown>(null)
  const [bezig, setBezig] = useState(false)
  const qc = useQueryClient()
  const zonderAgenda = !!status?.gekoppeld && !(status.scopes ?? "").includes(SCOPES.agenda)
  const zonderLezen = !!status?.gekoppeld && !(status.scopes ?? "").includes(SCOPES.lezen)

  async function laad() {
    try {
      setStatus(await pb.send<Status>("/api/ducdalf/google/status", {}))
    } catch (err) {
      setFout(err)
    }
  }
  useEffect(() => { laad() }, [])

  async function koppelen() {
    setFout(null)
    setBezig(true)
    // Het venster direct bij de klik openen, anders houdt de pop-upblokkering het tegen.
    const venster = openVenster()
    try {
      const { url } = await pb.send<{ url: string }>("/api/ducdalf/google/koppelen", { method: "POST" })
      if (!venster || venster.closed) throw new Error("Het venster van Google kon niet worden geopend. Sta pop-ups toe voor deze site.")
      venster.location.href = url
      // Wachten tot het venster dicht is of de koppeling er is.
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const s = await pb.send<Status>("/api/ducdalf/google/status", {})
        if (s.gekoppeld && s.gekoppeld_op !== status?.gekoppeld_op) {
          setStatus(s)
          ontkoppelGmail()
          await haalServerToken()
          await qc.invalidateQueries({ queryKey: ["agenda"] })
          venster.close()
          return
        }
        if (venster.closed) {
          setStatus(s)
          return
        }
      }
    } catch (err) {
      venster?.close()
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  async function verbreken() {
    if (!window.confirm("Koppeling met Google verbreken? Mailen, Drive en aanmeldingen werken dan pas weer na opnieuw koppelen.")) return
    setFout(null)
    setBezig(true)
    try {
      await pb.send("/api/ducdalf/google/koppeling", { method: "DELETE" })
      ontkoppelGmail()
      await laad()
    } catch (err) {
      setFout(err)
    } finally {
      setBezig(false)
    }
  }

  return (
    <Kaart titel="Google-account (Gmail en Drive)">
      <div className="flex flex-col gap-3 text-sm">
        {!status ? (
          <p className="text-zacht">Laden…</p>
        ) : status.gekoppeld ? (
          <>
            <Melding soort="succes">
              Vast gekoppeld met <strong>{status.email}</strong>
              {status.gekoppeld_op && <> sinds {formatTijdstip(status.gekoppeld_op)}</>}
              {status.gekoppeld_door && <> (door {status.gekoppeld_door})</>}. Iedereen die in de app is ingelogd, mailt en
              gebruikt Drive via dit account, zonder Google-venster.
            </Melding>
            {zonderAgenda && (
              <Melding soort="info">
                Deze koppeling heeft nog geen toegang tot Google Agenda (voor eigen verblijven in de kalender). Klik op
                Opnieuw koppelen en vink ook Google Agenda aan.
              </Melding>
            )}
            {zonderLezen && (
              <Melding soort="info">
                Deze koppeling mag Gmail nog niet lezen. Dat is nodig om reacties van huurders op mails uit de app bij de
                boeking te tonen. Klik op Opnieuw koppelen en vink ook "E-mails lezen" aan.
              </Melding>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={zonderAgenda || zonderLezen ? "knop" : "knop-rand"} disabled={bezig} onClick={koppelen}>
                {bezig ? "Wachten op Google…" : "Opnieuw koppelen"}
              </button>
              <button type="button" className="knop-rand" disabled={bezig} onClick={verbreken}>Koppeling verbreken</button>
            </div>
          </>
        ) : (
          <>
            <p>
              Koppel eenmalig het Google-account van de afzender{afzender ? <> (<strong>{afzender}</strong>)</> : null}. Daarna
              werken mailen, de kopie in Drive, het ophalen van aanmeldingen en de eigen verblijven uit Google Agenda in
              elke browser zonder Google-venster. De
              blijvende sleutel staat alleen op de NAS.
            </p>
            <p className="text-xs text-zacht">
              Kies in het Google-venster het afzenderaccount en vink alle rechten aan. Zie je "Google heeft deze app niet
              geverifieerd", klik dan op Geavanceerd → Doorgaan.
            </p>
            <div>
              <button type="button" className="knop" disabled={bezig} onClick={koppelen}>
                {bezig ? "Wachten op Google…" : "Google-account koppelen"}
              </button>
            </div>
          </>
        )}
        {fout ? <Fout fout={fout} /> : null}
      </div>
    </Kaart>
  )
}
