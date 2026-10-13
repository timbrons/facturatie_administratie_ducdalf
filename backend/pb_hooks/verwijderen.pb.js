/// <reference path="../pb_data/types.d.ts" />

// Een huurder definitief verwijderen, met alle boekingen, facturen (en hun
// PDF's), betalingen, statushistorie, het maillog en maandaangiften
// toeristenbelasting waar daarna geen verblijf meer bij hoort. Bedoeld voor
// testgegevens en vergissingen; voor echte huurders is er anonimiseren
// (facturen moeten 7 jaar bewaard blijven).
//
// Alles gebeurt in één transactie. Waren de verwijderde facturen de laatste
// nummers van hun jaar, dan schuift de nummerreeks terug, zodat er geen gat
// in de nummering ontstaat. Kopieën in Google Drive verwijdert de app zelf
// vóór deze aanroep.

routerAdd("POST", "/api/ducdalf/huurders/{id}/verwijderen", (e) => {
  const id = e.request.pathValue("id")
  const resultaat = { boekingen: 0, facturen: 0, betalingen: 0, mails: 0, aangiften: 0, teruggezet: [] }

  e.app.runInTransaction((tx) => {
    const huurder = tx.findRecordById("huurders", id)
    const boekingen = tx.findRecordsByFilter("boekingen", "huurder = {:h}", "", 0, 0, { h: id })
    const verwijderdeNummers = {}
    const aangiften = {}

    for (const b of boekingen) {
      const filter = "boeking = {:b}"
      const params = { b: b.id }
      for (const p of tx.findRecordsByFilter("betalingen", filter, "", 0, 0, params)) {
        tx.delete(p)
        resultaat.betalingen++
      }
      // Eerst creditfacturen, dan de facturen waar ze naar verwijzen.
      const facturen = tx.findRecordsByFilter("facturen", filter, "soort", 0, 0, params)
      for (const f of facturen) {
        const m = /^(\d{4})-(\d{3,})$/.exec(f.getString("nummer"))
        if (m) {
          verwijderdeNummers[m[1]] = verwijderdeNummers[m[1]] || {}
          verwijderdeNummers[m[1]][parseInt(m[2], 10)] = true
        }
        tx.delete(f)
        resultaat.facturen++
      }
      for (const m of tx.findRecordsByFilter("mail_log", filter, "", 0, 0, params)) {
        tx.delete(m)
        resultaat.mails++
      }
      if (b.getString("tb_aangifte")) aangiften[b.getString("tb_aangifte")] = true
      tx.delete(b) // statuswijzigingen gaan mee (cascade)
      resultaat.boekingen++
    }

    // Nummerreeks terugzetten zolang het laatste nummer een verwijderde factuur was.
    for (const jaar of Object.keys(verwijderdeNummers)) {
      let reeks
      try {
        reeks = tx.findFirstRecordByFilter("nummerreeksen", "jaar = {:j}", { j: parseInt(jaar, 10) })
      } catch (_) {
        continue
      }
      let laatste = reeks.getInt("laatste")
      while (laatste > 0 && verwijderdeNummers[jaar][laatste]) {
        resultaat.teruggezet.push(jaar + "-" + String(laatste).padStart(3, "0"))
        laatste--
      }
      if (laatste !== reeks.getInt("laatste")) {
        reeks.set("laatste", laatste)
        tx.save(reeks)
      }
    }

    // Maandaangiften toeristenbelasting waar nu geen enkel verblijf meer bij hoort
    // (bijv. alleen voor een test geregistreerd) gaan ook weg, met hun bewijsstukken.
    for (const aid of Object.keys(aangiften)) {
      const over = tx.findRecordsByFilter("boekingen", "tb_aangifte = {:a}", "", 1, 0, { a: aid })
      if (over.length > 0) continue
      try {
        tx.delete(tx.findRecordById("tb_aangiften", aid))
        resultaat.aangiften++
      } catch (_) {}
    }

    tx.delete(huurder)
  })

  return e.json(200, resultaat)
}, $apis.requireAuth("users"))
