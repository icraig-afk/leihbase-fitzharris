/// <reference path="../pb_data/types.d.ts" />

// Fork-only: a second sign-up checkbox, for the Operating Policy & Borrower
// Agreement. Shown when `borrower_terms_link` is set on the leihbase record.
// When users accept it, the time is stored on the user.
migrate(
  (app) => {
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.add(
      new Field({
        id: "url1794300001",
        name: "borrower_terms_link",
        type: "url",
      })
    );
    app.save(leihbase);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    users.fields.add(
      new Field({
        id: "date1794300002",
        name: "borrower_terms_accepted",
        type: "date",
        hidden: true,
      })
    );
    app.save(users);
  },
  (app) => {
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.removeById("url1794300001");
    app.save(leihbase);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    users.fields.removeById("date1794300002");
    app.save(users);
  }
);
