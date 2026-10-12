/// <reference path="../pb_data/types.d.ts" />

// Basisschema voor het verhuurbeheer van Duc'dalf.
//
// Alle bedragen worden opgeslagen als gehele centen (velden met de
// achtervoegsel `_cent`), percentages als basispunten (`_bp`, 100 bp = 1%).
// Datums zonder tijd (aankomst, vertrek, vervaldatums) zijn tekstvelden in
// het formaat JJJJ-MM-DD, zodat er nooit tijdzone-verschuivingen optreden.

migrate((app) => {
  // Alleen ingelogde gebruikers uit de `users`-collectie. Wie in `users`
  // mag komen, wordt afgedwongen door de hooks in pb_hooks/toegang.pb.js.
  const ALLEEN_INGELOGD = '@request.auth.id != "" && @request.auth.collectionName = "users"'

  const datum = (name, extra) => ({
    name,
    type: "text",
    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    max: 10,
    ...(extra || {}),
  })
  const cent = (name, extra) => ({ name, type: "number", onlyInt: true, ...(extra || {}) })
  const tijdstempels = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]

  function maak(name, fields, opts) {
    const collection = new Collection({
      type: "base",
      name,
      listRule: ALLEEN_INGELOGD,
      viewRule: ALLEEN_INGELOGD,
      createRule: ALLEEN_INGELOGD,
      updateRule: ALLEEN_INGELOGD,
      deleteRule: ALLEEN_INGELOGD,
      fields: [...fields, ...tijdstempels],
      indexes: (opts && opts.indexes) || [],
    })
    app.save(collection)
    return collection
  }
  const rel = (name, collection, extra) => ({
    name,
    type: "relation",
    collectionId: collection.id,
    maxSelect: 1,
    cascadeDelete: false,
    ...(extra || {}),
  })

  // ---------------------------------------------------------------------
  // users: alleen inloggen via Google (OAuth2), geen registratie
  // ---------------------------------------------------------------------
  const users = app.findCollectionByNameOrId("users")
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  users.createRule = null
  users.updateRule = "id = @request.auth.id"
  users.deleteRule = null
  users.passwordAuth.enabled = false
  users.oauth2.enabled = true
  users.oauth2.mappedFields.name = "name"
  users.oauth2.mappedFields.avatarURL = ""
  app.save(users)

  // ---------------------------------------------------------------------
  // instellingen: één record met afzender, bank, termijnen en vaste kosten
  // ---------------------------------------------------------------------
  const instellingen = maak("instellingen", [
    { name: "afzender_naam", type: "text", max: 200 },
    { name: "afzender_adres", type: "text", max: 500 },
    { name: "afzender_telefoon", type: "text", max: 50 },
    { name: "afzender_email", type: "text", max: 200 },
    { name: "accommodatie_naam", type: "text", max: 200 },
    { name: "bank_tnv", type: "text", max: 200 },
    { name: "bank_iban", type: "text", max: 50 },
    cent("schoonmaak_cent", { min: 0 }),
    cent("parkkosten_per_nacht_cent", { min: 0 }),
    { name: "parkkosten_apart_op_factuur", type: "bool" },
    { name: "min_nachten", type: "number", onlyInt: true, min: 0 },
    { name: "max_personen", type: "number", onlyInt: true, min: 1 },
    { name: "aanbetaling_pct", type: "number", onlyInt: true, min: 0, max: 100 },
    { name: "aanbetaling_termijn_maanden", type: "number", onlyInt: true, min: 0 },
    { name: "rest_weken_voor_aankomst", type: "number", onlyInt: true, min: 0 },
    { name: "herinnering_rest_dagen", type: "number", onlyInt: true, min: 0 },
    { name: "aankomst_vooruit_dagen", type: "number", onlyInt: true, min: 0 },
    { name: "tb_aangifte_dag", type: "number", onlyInt: true, min: 1, max: 28 },
    { name: "tb_portaal_url", type: "url" },
    { name: "aanmeldformulier_url", type: "url" },
    { name: "bewaartermijn_jaren", type: "number", onlyInt: true, min: 1 },
    {
      name: "brochure",
      type: "file",
      maxSelect: 1,
      maxSize: 20 * 1024 * 1024,
      mimeTypes: ["application/pdf"],
    },
    {
      name: "huisfoto",
      type: "file",
      maxSelect: 1,
      maxSize: 5 * 1024 * 1024,
      mimeTypes: ["image/jpeg", "image/png"],
    },
  ])
  // De instellingen worden nooit verwijderd of dubbel aangemaakt.
  instellingen.createRule = null
  instellingen.deleteRule = null
  app.save(instellingen)

  // ---------------------------------------------------------------------
  // seizoenen: prijs per nacht (inclusief parkkosten) per periode
  // ---------------------------------------------------------------------
  maak(
    "seizoenen",
    [
      { name: "jaar", type: "number", onlyInt: true, required: true, min: 2000 },
      { name: "naam", type: "text", required: true, max: 100 },
      datum("van", { required: true }),
      datum("tot", { required: true }),
      cent("prijs_per_nacht_cent", { required: true, min: 1 }),
      { name: "min_nachten", type: "number", onlyInt: true, min: 0 },
    ],
    { indexes: ["CREATE INDEX idx_seizoenen_van ON seizoenen (van)"] },
  )

  // ---------------------------------------------------------------------
  // extras: bij te boeken posten zoals linnen- en handdoekenpakketten
  // ---------------------------------------------------------------------
  maak("extras", [
    { name: "naam", type: "text", required: true, max: 200 },
    { name: "omschrijving", type: "text", max: 1000 },
    cent("prijs_cent", { required: true, min: 0 }),
    { name: "eenheid", type: "select", maxSelect: 1, values: ["per_stuk", "per_nacht", "per_verblijf"] },
    { name: "actief", type: "bool" },
    { name: "volgorde", type: "number", onlyInt: true },
  ])

  // ---------------------------------------------------------------------
  // tb_tarieven: parameters voor de richtberekening van de taxe de séjour.
  // Het bedrag uit de simulatie in het portaal gaat altijd voor.
  // ---------------------------------------------------------------------
  maak(
    "tb_tarieven",
    [
      datum("geldig_vanaf", { required: true }),
      { name: "omschrijving", type: "text", max: 300 },
      // Percentage van de kosten per persoon per nacht (500 bp = 5%)
      { name: "percentage_bp", type: "number", onlyInt: true, min: 0 },
      // Plafond van het basistarief per persoon per nacht, vóór opslagen
      cent("plafond_cent", { min: 0 }),
      // Opslagen als lijst: [{ "naam": "Hérault", "bp": 1000 }, ...]
      { name: "opslagen", type: "json", maxSize: 10000 },
      // Leeftijd vanaf wanneer iemand belastingplichtig is
      { name: "volwassen_vanaf_leeftijd", type: "number", onlyInt: true, min: 0 },
    ],
    { indexes: ["CREATE UNIQUE INDEX idx_tb_tarieven_vanaf ON tb_tarieven (geldig_vanaf)"] },
  )

  // ---------------------------------------------------------------------
  // huurders
  // ---------------------------------------------------------------------
  const huurders = maak(
    "huurders",
    [
      { name: "aanhef", type: "text", max: 20 },
      { name: "voornaam", type: "text", max: 100 },
      { name: "achternaam", type: "text", max: 150 },
      { name: "email", type: "email" },
      { name: "telefoon_mobiel", type: "text", max: 50 },
      { name: "telefoon_vast", type: "text", max: 50 },
      { name: "adres", type: "text", max: 200 },
      { name: "postcode", type: "text", max: 20 },
      { name: "plaats", type: "text", max: 100 },
      { name: "land", type: "text", max: 100 },
      { name: "kenteken", type: "text", max: 20 },
      { name: "taal", type: "select", maxSelect: 1, values: ["nl", "en", "fr", "de"] },
      { name: "notities", type: "text", max: 5000 },
      { name: "geanonimiseerd_op", type: "date" },
    ],
    { indexes: ["CREATE INDEX idx_huurders_email ON huurders (email)"] },
  )

  // ---------------------------------------------------------------------
  // workflow_stappen: statussen, teksten en volgorde (configureerbaar)
  // ---------------------------------------------------------------------
  maak(
    "workflow_stappen",
    [
      { name: "sleutel", type: "text", required: true, max: 50, pattern: "^[a-z_]+$" },
      { name: "label", type: "text", required: true, max: 100 },
      { name: "actie_label", type: "text", max: 100 },
      { name: "omschrijving", type: "text", max: 1000 },
      { name: "volgorde", type: "number", onlyInt: true, required: true },
      // Naam van een voorwaarde uit de frontend (zie frontend/src/domein/workflow.ts),
      // bijv. "geen_aanbetaling": de stap wordt dan automatisch overgeslagen.
      { name: "overslaan_als", type: "text", max: 50 },
      { name: "actief", type: "bool" },
    ],
    { indexes: ["CREATE UNIQUE INDEX idx_workflow_sleutel ON workflow_stappen (sleutel)"] },
  )

  // ---------------------------------------------------------------------
  // tb_aangiften: maandaangifte toeristenbelasting in het portaal
  // ---------------------------------------------------------------------
  const tbAangiften = maak(
    "tb_aangiften",
    [
      { name: "periode", type: "text", required: true, max: 7, pattern: "^\\d{4}-\\d{2}$" },
      datum("ingediend_op"),
      cent("aangegeven_cent", { min: 0 }),
      { name: "referentie", type: "text", max: 200 },
      {
        name: "bewijs",
        type: "file",
        maxSelect: 5,
        maxSize: 10 * 1024 * 1024,
        mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
      },
      datum("afgedragen_op"),
      cent("afgedragen_cent", { min: 0 }),
      { name: "notities", type: "text", max: 5000 },
    ],
    { indexes: ["CREATE UNIQUE INDEX idx_tb_aangiften_periode ON tb_aangiften (periode)"] },
  )

  // ---------------------------------------------------------------------
  // boekingen
  // ---------------------------------------------------------------------
  const boekingen = maak(
    "boekingen",
    [
      // Unieke, niet te raden code (o.a. voor het koppelen van het aanmeldformulier)
      { name: "code", type: "text", max: 32, pattern: "^[A-Za-z0-9]*$" },
      rel("huurder", huurders),
      datum("aankomst", { required: true }),
      datum("vertrek", { required: true }),
      { name: "volwassenen", type: "number", onlyInt: true, min: 0 },
      { name: "kinderen", type: "number", onlyInt: true, min: 0 },
      { name: "kenteken", type: "text", max: 20 },
      { name: "bron", type: "text", max: 100 },
      { name: "taal", type: "select", maxSelect: 1, values: ["nl", "en", "fr", "de"] },
      { name: "optie", type: "bool" },

      // Workflow
      { name: "status", type: "text", required: true, max: 50 },
      { name: "status_sinds", type: "date" },
      { name: "geannuleerd_reden", type: "text", max: 2000 },

      // Prijsopbouw (in centen)
      cent("huur_cent", { min: 0 }),
      cent("huur_berekend_cent", { min: 0 }),
      { name: "huur_handmatig", type: "bool" },
      cent("parkkosten_cent", { min: 0 }),
      cent("schoonmaak_cent", { min: 0 }),
      // [{ "extra": "<id>", "naam": "...", "aantal": 1, "prijs_cent": 2500, "eenheid": "per_stuk" }]
      { name: "extras", type: "json", maxSize: 20000 },
      cent("tb_berekend_cent", { min: 0 }),
      cent("tb_portaal_cent", { min: 0 }),
      { name: "tb_portaal_op", type: "date" },

      // Betalingsafspraak
      { name: "betaalwijze", type: "select", maxSelect: 1, values: ["ineens", "aanbetaling"] },
      { name: "aanbetaling_pct", type: "number", onlyInt: true, min: 0, max: 100 },
      datum("aanbetaling_vervaldatum"),
      datum("rest_vervaldatum"),

      // Toeristenbelasting na vertrek
      rel("tb_aangifte", tbAangiften),
      { name: "tb_definitief_volwassenen", type: "number", onlyInt: true, min: 0 },
      { name: "tb_definitief_kinderen", type: "number", onlyInt: true, min: 0 },
      cent("tb_aangegeven_cent", { min: 0 }),
      datum("tb_aangegeven_op"),

      // Ingevuld aanmeldformulier (ruwe gegevens, wordt bij anonimiseren gewist)
      { name: "aanmelding", type: "json", maxSize: 50000 },
      { name: "notities", type: "text", max: 10000 },
    ],
    {
      indexes: [
        "CREATE UNIQUE INDEX idx_boekingen_code ON boekingen (code) WHERE code != ''",
        "CREATE INDEX idx_boekingen_aankomst ON boekingen (aankomst)",
        "CREATE INDEX idx_boekingen_status ON boekingen (status)",
      ],
    },
  )

  // ---------------------------------------------------------------------
  // statuswijzigingen: historie van de workflow (wordt door een hook gevuld)
  // ---------------------------------------------------------------------
  const statuswijzigingen = maak("statuswijzigingen", [
    rel("boeking", boekingen, { required: true, cascadeDelete: true }),
    { name: "van", type: "text", max: 50 },
    { name: "naar", type: "text", required: true, max: 50 },
    { name: "door", type: "text", max: 200 },
    { name: "opmerking", type: "text", max: 2000 },
  ])
  // Historie is alleen-lezen voor de app.
  statuswijzigingen.createRule = null
  statuswijzigingen.updateRule = null
  statuswijzigingen.deleteRule = null
  app.save(statuswijzigingen)

  // ---------------------------------------------------------------------
  // facturen, nummerreeksen en betalingen
  // ---------------------------------------------------------------------
  const facturen = maak(
    "facturen",
    [
      rel("boeking", boekingen, { required: true }),
      { name: "nummer", type: "text", max: 20 },
      { name: "soort", type: "select", maxSelect: 1, values: ["factuur", "credit"] },
      datum("factuurdatum", { required: true }),
      // Vastgelegde factuurregels: [{ "omschrijving", "nachten", "personen", "bedrag_cent" }]
      { name: "regels", type: "json", maxSize: 50000 },
      // Vastgelegde afzender-, huurder- en bankgegevens op het moment van factureren
      { name: "gegevens", type: "json", maxSize: 50000 },
      cent("totaal_cent"),
      cent("aanbetaling_cent"),
      datum("aanbetaling_vervaldatum"),
      datum("rest_vervaldatum"),
      {
        name: "pdf",
        type: "file",
        maxSelect: 1,
        maxSize: 10 * 1024 * 1024,
        mimeTypes: ["application/pdf"],
      },
      { name: "verstuurd_op", type: "date" },
      { name: "vergrendeld", type: "bool" },
    ],
    { indexes: ["CREATE UNIQUE INDEX idx_facturen_nummer ON facturen (nummer) WHERE nummer != ''"] },
  )
  facturen.fields.add(new RelationField({ name: "verwijst_naar", collectionId: facturen.id, maxSelect: 1 }))
  // Facturen worden nooit verwijderd (fiscale bewaarplicht); corrigeren gaat via een creditfactuur.
  facturen.deleteRule = null
  app.save(facturen)

  const nummerreeksen = maak(
    "nummerreeksen",
    [
      { name: "jaar", type: "number", onlyInt: true, required: true, min: 2000 },
      { name: "laatste", type: "number", onlyInt: true, min: 0 },
    ],
    { indexes: ["CREATE UNIQUE INDEX idx_nummerreeksen_jaar ON nummerreeksen (jaar)"] },
  )
  nummerreeksen.deleteRule = null
  app.save(nummerreeksen)

  maak("betalingen", [
    rel("boeking", boekingen, { required: true }),
    rel("factuur", facturen),
    datum("datum", { required: true }),
    cent("bedrag_cent", { required: true }),
    { name: "soort", type: "select", maxSelect: 1, values: ["aanbetaling", "rest", "volledig", "terugbetaling", "overig"] },
    { name: "opmerking", type: "text", max: 2000 },
  ])

  // ---------------------------------------------------------------------
  // e-mail: sjablonen en log
  // ---------------------------------------------------------------------
  maak(
    "mail_sjablonen",
    [
      { name: "sleutel", type: "text", required: true, max: 50, pattern: "^[a-z_]+$" },
      { name: "taal", type: "select", required: true, maxSelect: 1, values: ["nl", "en", "fr", "de"] },
      { name: "naam", type: "text", required: true, max: 200 },
      { name: "onderwerp", type: "text", required: true, max: 500 },
      { name: "tekst", type: "text", max: 20000 },
      { name: "bijlagen", type: "select", maxSelect: 2, values: ["brochure", "factuur"] },
    ],
    { indexes: ["CREATE UNIQUE INDEX idx_mail_sjablonen ON mail_sjablonen (sleutel, taal)"] },
  )

  const maillog = maak("mail_log", [
    rel("boeking", boekingen),
    { name: "aan", type: "text", max: 500 },
    { name: "onderwerp", type: "text", max: 500 },
    { name: "tekst", type: "text", max: 50000 },
    { name: "bijlagen", type: "json", maxSize: 5000 },
    { name: "sjablonen", type: "json", maxSize: 2000 },
    { name: "gmail_message_id", type: "text", max: 200 },
    { name: "gmail_thread_id", type: "text", max: 200 },
  ])
  maillog.updateRule = null
  maillog.deleteRule = null
  app.save(maillog)
}, (app) => {
  const namen = [
    "mail_log", "mail_sjablonen", "betalingen", "nummerreeksen", "facturen",
    "statuswijzigingen", "boekingen", "tb_aangiften", "workflow_stappen",
    "huurders", "tb_tarieven", "extras", "seizoenen", "instellingen",
  ]
  for (const naam of namen) {
    try {
      app.delete(app.findCollectionByNameOrId(naam))
    } catch (_) {}
  }
})
