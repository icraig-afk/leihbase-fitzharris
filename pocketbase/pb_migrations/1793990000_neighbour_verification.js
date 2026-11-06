/// <reference path="../pb_data/types.d.ts" />

// Neighbour verification: users pick one of the allowed streets on sign-up,
// and can only reserve after entering a one-time code sent to them by post.
// Enabled with the `address_verification` setting on the leihbase record.
migrate(
  (app) => {
    // Allowed streets
    const streets = new Collection({
      id: "pbc_1793990001",
      name: "streets",
      type: "base",
      system: false,
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: '@request.auth.role = "admin"',
      fields: [
        {
          autogeneratePattern: "[a-z0-9]{15}",
          id: "text3208210256",
          max: 15,
          min: 15,
          name: "id",
          pattern: "^[a-z0-9]+$",
          primaryKey: true,
          required: true,
          system: true,
          type: "text",
        },
        { id: "text1793990011", name: "name", type: "text", required: true },
        { id: "text1793990012", name: "postcode", type: "text" },
        { id: "text1793990013", name: "town", type: "text" },
        { id: "bool1793990014", name: "active", type: "bool" },
        {
          id: "autodate1793990015",
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
        },
        {
          id: "autodate1793990016",
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_streets_name` ON `streets` (`name`)",
      ],
    });
    app.save(streets);

    // One-time codes, only accessible through the address-verification routes
    const codes = new Collection({
      id: "pbc_1793990002",
      name: "address_codes",
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          autogeneratePattern: "[a-z0-9]{15}",
          id: "text3208210256",
          max: 15,
          min: 15,
          name: "id",
          pattern: "^[a-z0-9]+$",
          primaryKey: true,
          required: true,
          system: true,
          type: "text",
        },
        {
          id: "relation1793990021",
          name: "user",
          type: "relation",
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          id: "text1793990022",
          name: "code_hash",
          type: "text",
          hidden: true,
          required: true,
        },
        { id: "date1793990023", name: "expires", type: "date" },
        { id: "date1793990024", name: "used", type: "date" },
        { id: "number1793990025", name: "attempts", type: "number" },
        {
          id: "autodate1793990026",
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
        },
        {
          id: "autodate1793990027",
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        "CREATE INDEX `idx_address_codes_user` ON `address_codes` (`user`)",
      ],
    });
    app.save(codes);

    // Address fields on users
    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    users.fields.add(
      new Field({
        id: "relation1793990031",
        name: "street",
        type: "relation",
        collectionId: "pbc_1793990001",
        cascadeDelete: false,
        maxSelect: 1,
      })
    );
    users.fields.add(
      new Field({ id: "text1793990032", name: "house_number", type: "text" })
    );
    users.fields.add(
      new Field({ id: "text1793990033", name: "address_extra", type: "text" })
    );
    users.fields.add(
      new Field({
        id: "bool1793990034",
        name: "address_verified",
        type: "bool",
        hidden: true,
      })
    );
    users.fields.add(
      new Field({
        id: "date1793990035",
        name: "address_verified_at",
        type: "date",
        hidden: true,
      })
    );
    app.save(users);

    // Existing users keep being able to reserve
    app.db().newQuery("UPDATE users SET address_verified = TRUE").execute();

    // Setting to enable the feature
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.add(
      new Field({
        id: "bool1793990041",
        name: "address_verification",
        type: "bool",
      })
    );
    app.save(leihbase);
  },
  (app) => {
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.removeById("bool1793990041");
    app.save(leihbase);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    [
      "relation1793990031",
      "text1793990032",
      "text1793990033",
      "bool1793990034",
      "date1793990035",
    ].forEach((id) => users.fields.removeById(id));
    app.save(users);

    app.delete(app.findCollectionByNameOrId("pbc_1793990002"));
    app.delete(app.findCollectionByNameOrId("pbc_1793990001"));
  }
);
