/// <reference path="../pb_data/types.d.ts" />

// Fork-only: data retention, as described in the privacy policy. A nightly job
// (retention.cron.pb.js) closes inactive accounts after a warning email,
// anonymises old reservations, and deletes closed accounts after a few years.
// Each period is set on the leihbase record, in days; empty or 0 turns that
// part off.

/**
 * A number of days on the leihbase record
 * @param {string} id
 * @param {string} name
 * @param {string} help
 */
function daysField(id, name, help) {
  return new Field({
    id,
    name,
    type: "number",
    min: 0,
    onlyInt: true,
    help,
  });
}

migrate(
  (app) => {
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.add(
      daysField(
        "number1795200001",
        "retention_inactive_days",
        "Days without activity (login, visit or reservation) after which a user's account is closed, e.g. 730 for 2 years. Empty or 0: never."
      )
    );
    leihbase.fields.add(
      daysField(
        "number1795200002",
        "retention_warning_days",
        "Days before closing an inactive account to email the user a warning, e.g. 30. Empty or 0: no warning."
      )
    );
    leihbase.fields.add(
      daysField(
        "number1795200003",
        "retention_reservation_days",
        "Days after a reservation ended to anonymise it: the user, their message, the note and the sent emails are removed, the item and dates kept. E.g. 730. Empty or 0: never."
      )
    );
    leihbase.fields.add(
      daysField(
        "number1795200004",
        "retention_closed_days",
        "Days after an account was closed to delete it, with the record of the agreements it accepted. E.g. 2190 for 6 years. Empty or 0: never."
      )
    );
    app.save(leihbase);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    users.fields.add(
      new Field({
        id: "date1795200011",
        name: "last_active",
        type: "date",
        hidden: true,
        help: "Last login or visit, at most once a day",
      })
    );
    users.fields.add(
      new Field({
        id: "date1795200012",
        name: "retention_warning_sent",
        type: "date",
        hidden: true,
        help: "When the warning about closing the inactive account was sent",
      })
    );
    users.fields.add(
      new Field({
        id: "date1795200013",
        name: "closed_at",
        type: "date",
        hidden: true,
        help: "When the account was closed: personal data removed, agreements kept",
      })
    );
    users.fields.add(
      new Field({
        id: "bool1795200014",
        name: "close_requested",
        type: "bool",
        hidden: true,
        help: "Tick to close this account during the next nightly run, e.g. when the user asked for it",
      })
    );
    app.save(users);

    const reservations = app.findCollectionByNameOrId("h7plyphsy0mgjpf");
    reservations.fields.add(
      new Field({
        id: "date1795200021",
        name: "anonymised_at",
        type: "date",
        help: "When the reservation was anonymised",
      })
    );
    app.save(reservations);
  },
  (app) => {
    const reservations = app.findCollectionByNameOrId("h7plyphsy0mgjpf");
    reservations.fields.removeById("date1795200021");
    app.save(reservations);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    for (const id of [
      "date1795200011",
      "date1795200012",
      "date1795200013",
      "bool1795200014",
    ]) {
      users.fields.removeById(id);
    }
    app.save(users);

    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    for (const id of [
      "number1795200001",
      "number1795200002",
      "number1795200003",
      "number1795200004",
    ]) {
      leihbase.fields.removeById(id);
    }
    app.save(leihbase);
  }
);
