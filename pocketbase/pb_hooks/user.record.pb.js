/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const { requestInfo, record } = e;

  if (!record) {
    throw new BadRequestError();
  }

  // Validate captcha, if captcha is enabled
  const capInstanceHost = $os.getenv("CONFIG_CAP_INSTANCE_HOST");
  const capSiteKey = $os.getenv("CONFIG_CAP_SITE_KEY");
  const capSecretKey = $os.getenv("CONFIG_CAP_SECRET_KEY");
  if (capInstanceHost && capSiteKey && capSecretKey) {
    const body = requestInfo().body;
    if (!body["cap-token"]) {
      throw new BadRequestError("Captcha_invalid.");
    }

    const res = $http.send({
      url: `https://${capInstanceHost}/${capSiteKey}/siteverify`,
      method: "POST",
      body: JSON.stringify({
        secret: capSecretKey,
        response: body["cap-token"],
      }),
      headers: { "Content-Type": "application/json" },
      timeout: 30,
    });

    if (!res.json.success) {
      throw new Error("Captcha_invalid.");
    }
  }

  // Make sure privacy policy has been accepted, if defined
  const leihbase = $app.findAllRecords("leihbase")[0];
  if (leihbase?.get("privacy_policy_link") && !record.getBool("terms")) {
    throw new BadRequestError("Terms_required.");
  }

  const isSuperuser = e.hasSuperuserAuth();
  if (!isSuperuser || !record.get("role")) {
    record.set("role", "user");
  }

  // Fork-only: make sure the Operating Policy & Borrower Agreement has been
  // accepted, if defined, and store when. Superusers creating accounts in the
  // PocketBase admin interface can skip it.
  if (!isSuperuser) {
    record.set("borrower_terms_accepted", "");
    if (leihbase?.getString("borrower_terms_link")) {
      const accepted = requestInfo().body["borrower_terms"];
      if (accepted !== true && accepted !== "true") {
        throw new BadRequestError("Borrower_terms_required.");
      }
      record.set("borrower_terms_accepted", new DateTime());
    }
  }

  // Neighbour verification: require one of the allowed streets, the address
  // is then verified with a code sent by post
  /** @type {typeof import('./lib/addressVerification')} */
  const { isEnabled } = require(`${__hooks}/lib/addressVerification`);
  if (isEnabled()) {
    if (!isSuperuser) {
      if (
        !record.getString("street") ||
        !record.getString("house_number").trim()
      ) {
        throw new BadRequestError("Address_required.");
      }
      let street;
      try {
        street = $app.findRecordById("streets", record.getString("street"));
      } catch (_) {
        street = null;
      }
      if (!street || !street.getBool("active")) {
        throw new BadRequestError("Street_not_allowed.");
      }
      record.set("address_verified", false);
    }
  } else if (
    !isSuperuser ||
    requestInfo().body["address_verified"] === undefined
  ) {
    // Users signing up while the feature is disabled don't need a code later
    record.set("address_verified", true);
  }

  e.next();

  // Let admins know a letter with a code needs to be printed and posted.
  // A failing mail server must not fail the sign-up.
  if (
    isEnabled() &&
    record.getString("role") === "user" &&
    !record.getBool("address_verified")
  ) {
    try {
      /** @type {typeof import('./lib/addressVerification')} */
      const { notifyAdminsOfNewNeighbour } = require(
        `${__hooks}/lib/addressVerification`
      );
      notifyAdminsOfNewNeighbour(record);
    } catch (err) {
      console.error("[address-verification] Failed to notify admins:", err);
    }
  }
}, "users");

onRecordUpdateRequest((e) => {
  const { record } = e;
  if (!record) {
    throw new BadRequestError();
  }

  // Once verified, the address can only be changed by a superuser
  const original = record.original();
  const addressChanged = ["street", "house_number", "address_extra"].some(
    (field) => record.getString(field) !== original.getString(field)
  );
  if (
    !e.hasSuperuserAuth() &&
    original.getBool("address_verified") &&
    addressChanged
  ) {
    throw new BadRequestError("Address_locked.");
  }

  // Fork-only: when the Operating Policy & Borrower Agreement was accepted is
  // set on sign-up, and can only be changed by a superuser
  if (
    !e.hasSuperuserAuth() &&
    record.getString("borrower_terms_accepted") !==
      original.getString("borrower_terms_accepted")
  ) {
    throw new BadRequestError("Borrower_terms_locked.");
  }

  e.next();
}, "users");

onRecordEnrich((e) => {
  // Unhide 'role' and 'manager_locations' for requesting user.
  if (
    e.record &&
    e.requestInfo &&
    e.requestInfo.auth &&
    e.requestInfo.auth.id === e.record.id
  ) {
    e.record.unhide("role");
    e.record.unhide("manager_locations");
    e.record.unhide("address_verified");
    e.record.unhide("address_verified_at");
  }

  e.next();
}, "users");
