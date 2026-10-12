/// <reference path="../pb_data/types.d.ts" />

// AVG: het maillog is onveranderlijk, behalve dat ontvanger en tekst bij het
// anonimiseren van een huurder mogen worden gewist.

onRecordUpdateRequest((e) => {
  const oud = e.record.original()
  for (const veld of ["boeking", "onderwerp", "bijlagen", "sjablonen", "gmail_message_id", "gmail_thread_id", "message_id", "status_na"]) {
    if (e.record.getString(veld) !== oud.getString(veld)) {
      throw new BadRequestError("Het maillog kan niet worden gewijzigd.")
    }
  }
  for (const veld of ["aan", "tekst"]) {
    const nieuw = e.record.getString(veld)
    if (nieuw !== oud.getString(veld) && nieuw !== "") {
      throw new BadRequestError("Het maillog kan alleen worden geanonimiseerd.")
    }
  }
  e.next()
}, "mail_log")
