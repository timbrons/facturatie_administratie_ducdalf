/// <reference path="../pb_data/types.d.ts" />

// Boekingen: unieke code, statushistorie en bewaking van de workflow.

onRecordCreateRequest((e) => {
  // De code wordt altijd door de server gekozen, nooit door de client.
  e.record.set("code", $security.randomStringWithAlphabet(16, "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"))
  e.record.set("status_sinds", new DateTime())
  e.next()

  const door = e.auth ? e.auth.email() : ""
  const wijziging = new Record(e.app.findCollectionByNameOrId("statuswijzigingen"))
  wijziging.set("boeking", e.record.id)
  wijziging.set("van", "")
  wijziging.set("naar", e.record.getString("status"))
  wijziging.set("door", door)
  e.app.save(wijziging)
}, "boekingen")

onRecordUpdateRequest((e) => {
  const oud = e.record.original().getString("status")
  const nieuw = e.record.getString("status")

  // De code is onveranderlijk.
  e.record.set("code", e.record.original().getString("code"))

  if (oud !== nieuw) {
    if (nieuw === "afgerond" && !e.record.getString("tb_aangegeven_op")) {
      throw new BadRequestError("Een boeking kan pas worden afgerond als de aangifte toeristenbelasting is geregistreerd.")
    }
    if (nieuw === "geannuleerd" && !e.record.getString("geannuleerd_reden").trim()) {
      throw new BadRequestError("Geef een reden voor de annulering op.")
    }
    e.record.set("status_sinds", new DateTime())
  }

  e.next()

  if (oud !== nieuw) {
    const wijziging = new Record(e.app.findCollectionByNameOrId("statuswijzigingen"))
    wijziging.set("boeking", e.record.id)
    wijziging.set("van", oud)
    wijziging.set("naar", nieuw)
    wijziging.set("door", e.auth ? e.auth.email() : "")
    wijziging.set("opmerking", nieuw === "geannuleerd" ? e.record.getString("geannuleerd_reden") : "")
    e.app.save(wijziging)
  }
}, "boekingen")
