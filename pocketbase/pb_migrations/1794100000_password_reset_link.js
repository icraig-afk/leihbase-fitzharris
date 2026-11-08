/// <reference path="../pb_data/types.d.ts" />

// Point the password reset email to the front-end page, instead of a
// hard-coded PocketBase admin URL of another instance. Only the link is
// replaced, so the text (and any customisation of it) stays as it is.
const RESET_LINK = /href="[^"]*confirm-password-reset[^"]*"/g;

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("_pb_users_auth_");
    collection.resetPasswordTemplate.body =
      collection.resetPasswordTemplate.body.replace(
        RESET_LINK,
        'href="{APP_URL}/confirm-password-reset?token={TOKEN}"'
      );
    app.save(collection);
  },
  (app) => {
    // Back to PocketBase's own reset page
    const collection = app.findCollectionByNameOrId("_pb_users_auth_");
    collection.resetPasswordTemplate.body =
      collection.resetPasswordTemplate.body.replace(
        RESET_LINK,
        'href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}"'
      );
    app.save(collection);
  }
);
