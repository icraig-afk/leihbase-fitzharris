/// <reference path="../pb_data/types.d.ts" />

// Fork-specific: the streets neighbours can sign up from. Postcode and town
// are left empty, fill them in via the PocketBase admin (they are printed on
// the letters). Neighbour verification itself stays off until the
// `address_verification` setting on the leihbase record is enabled.
const STREETS = [
  "Bath Street",
  "Letcombe Avenue",
  "Boxhill Walk",
  "Fitzharry's Road",
  "Clifton Drive",
  "Stanford Drive",
  "Nuneham Square",
  "Aston Close",
  "Sutton Close",
  "Kingston Close",
];

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("streets");
    for (const name of STREETS) {
      const existing = app.findRecordsByFilter(
        "streets",
        "name = {:name}",
        "",
        1,
        0,
        { name }
      );
      if (existing.length > 0) continue;
      const record = new Record(collection);
      record.set("name", name);
      record.set("active", true);
      app.save(record);
    }
  },
  (app) => {
    for (const name of STREETS) {
      const existing = app.findRecordsByFilter(
        "streets",
        "name = {:name}",
        "",
        1,
        0,
        { name }
      );
      if (existing[0]) app.delete(existing[0]);
    }
  }
);
