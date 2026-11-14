/// <reference path="../pb_data/types.d.ts" />

// Versioned privacy policy, accepted on sign-up, and again after changes.
// Works like the borrowing terms: the current version is set as
// `privacy_policy` on the leihbase record, a change creates a new version
// unless saved as a minor edit, and acceptances are stored per version. Without
// a privacy policy, `privacy_policy_link` works as before.

const ID_FIELD = {
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
};

/**
 * Created and updated dates
 * @param {string} prefix
 */
function autodates(prefix) {
  return [
    {
      id: `autodate${prefix}1`,
      name: "created",
      type: "autodate",
      onCreate: true,
      onUpdate: false,
    },
    {
      id: `autodate${prefix}2`,
      name: "updated",
      type: "autodate",
      onCreate: true,
      onUpdate: true,
    },
  ];
}

migrate(
  (app) => {
    const policies = new Collection({
      id: "pbc_1795100001",
      name: "privacy_policies",
      type: "base",
      system: false,
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: null,
      fields: [
        ID_FIELD,
        {
          id: "editor1795100011",
          name: "content",
          type: "editor",
          required: true,
          convertURLs: false,
        },
        ...autodates("179510001"),
      ],
    });
    app.save(policies);

    const acceptances = new Collection({
      id: "pbc_1795100002",
      name: "privacy_policy_acceptances",
      type: "base",
      system: false,
      listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
      viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
      // Only by the user themselves, see privacy_policy_acceptance.record.pb.js
      createRule: "user = @request.auth.id",
      updateRule: null,
      deleteRule: null,
      fields: [
        ID_FIELD,
        {
          id: "relation1795100021",
          name: "user",
          type: "relation",
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          id: "relation1795100022",
          name: "privacy_policy",
          type: "relation",
          collectionId: "pbc_1795100001",
          cascadeDelete: false,
          maxSelect: 1,
          required: true,
        },
        ...autodates("179510002"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_privacy_policy_acceptances_user_policy` ON `privacy_policy_acceptances` (`user`, `privacy_policy`)",
      ],
    });
    app.save(acceptances);

    // Current privacy policy, editable by admins
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.add(
      new Field({
        id: "relation1795100031",
        name: "privacy_policy",
        type: "relation",
        collectionId: "pbc_1795100001",
        cascadeDelete: false,
        maxSelect: 1,
        help: "Current privacy policy, accepted on sign-up. Edit it in the admin, under the instance settings. Replaces privacy_policy_link when set.",
      })
    );
    app.save(leihbase);
  },
  (app) => {
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.removeById("relation1795100031");
    app.save(leihbase);

    app.delete(app.findCollectionByNameOrId("pbc_1795100002"));
    app.delete(app.findCollectionByNameOrId("pbc_1795100001"));
  }
);
