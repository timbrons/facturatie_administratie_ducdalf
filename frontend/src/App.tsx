import { useEffect, useState } from "react"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"
import { pb } from "./lib/pb"
import { Layout } from "./components/Layout"
import { Inloggen } from "./paginas/Inloggen"
import { Dashboard } from "./paginas/Dashboard"
import { Boekingen } from "./paginas/Boekingen"
import { BoekingDetail } from "./paginas/BoekingDetail"
import { BoekingFormulier } from "./paginas/BoekingFormulier"
import { Huurders } from "./paginas/Huurders"
import { HuurderDetail } from "./paginas/HuurderDetail"
import { Kalender } from "./paginas/Kalender"
import { Prijzen } from "./paginas/Prijzen"
import { InstellingenPagina } from "./paginas/Instellingen"
import { Financieel } from "./paginas/Financieel"
import { Importeren } from "./paginas/Importeren"
import { Sjablonen } from "./paginas/Sjablonen"
import { Aanmeldingen } from "./paginas/Aanmeldingen"
import { Beheer } from "./paginas/Beheer"
import { Aanmelden } from "./paginas/Aanmelden"
import { Boeken } from "./paginas/Boeken"

function useIngelogd(): boolean {
  const [ingelogd, setIngelogd] = useState(pb.authStore.isValid)
  useEffect(() => pb.authStore.onChange(() => setIngelogd(pb.authStore.isValid)), [])
  return ingelogd
}

export function App() {
  const ingelogd = useIngelogd()

  // Ververs het token bij het opstarten; bij weigering (bijv. van de allowlist) uitloggen.
  useEffect(() => {
    if (!pb.authStore.isValid) return
    pb.collection("users").authRefresh().catch((err) => {
      if (err?.status === 401 || err?.status === 403) pb.authStore.clear()
    })
  }, [])

  // Het aanmeld- en boekingsformulier zijn openbaar: gasten hoeven niet in te loggen.
  if (/^#\/aanmelden(\?|$)/.test(window.location.hash)) return <Aanmelden />
  if (/^#\/boeken(\?|$)/.test(window.location.hash)) return <Boeken />
  if (!ingelogd) return <Inloggen />

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/boekingen" element={<Boekingen />} />
          <Route path="/boekingen/nieuw" element={<BoekingFormulier />} />
          <Route path="/boekingen/:id" element={<BoekingDetail />} />
          <Route path="/boekingen/:id/bewerken" element={<BoekingFormulier />} />
          <Route path="/kalender" element={<Kalender />} />
          <Route path="/huurders" element={<Huurders />} />
          <Route path="/huurders/:id" element={<HuurderDetail />} />
          <Route path="/prijzen" element={<Prijzen />} />
          <Route path="/instellingen" element={<InstellingenPagina />} />
          <Route path="/financieel" element={<Financieel />} />
          <Route path="/importeren" element={<Importeren />} />
          <Route path="/sjablonen" element={<Sjablonen />} />
          <Route path="/aanmeldingen" element={<Aanmeldingen />} />
          <Route path="/beheer" element={<Beheer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
