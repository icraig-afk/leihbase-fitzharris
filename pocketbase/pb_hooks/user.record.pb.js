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

  /** @type {typeof import('./lib/privacyPolicy')} */
  const { getCurrentPrivacyPolicy, savePrivacyPolicyAcceptance } = require(
    `${__hooks}/lib/privacyPolicy`
  );
  /** @type {typeof import('./lib/borrowAgreement')} */
  const { getInstanceBorrowAgreement } = require(
    `${__hooks}/lib/borrowAgreement`
  );

  const isSuperuser = e.hasSuperuserAuth();
  const body = requestInfo().body;

  // Make sure the privacy policy has been accepted, if defined: the current
  // version of the privacy policy, or else the privacy policy link
  const leihbase = $app.findAllRecords("leihbase")[0];
  const privacyPolicy = getCurrentPrivacyPolicy();
  if (privacyPolicy) {
    if (!isSuperuser && body["privacy_policy"] !== privacyPolicy) {
      throw new BadRequestError("Terms_required.");
    }
    record.set("terms", true);
  } else if (leihbase?.get("privacy_policy_link") && !record.getBool("terms")) {
    throw new BadRequestError("Terms_required.");
  }

  // Borrowing terms for all locations are accepted on sign-up too
  const borrowAgreement = getInstanceBorrowAgreement();
  if (
    borrowAgreement &&
    !isSuperuser &&
    body["borrow_agreement"] !== borrowAgreement
  ) {
    throw new BadRequestError("Borrow_agreement_required.");
  }

  if (!isSuperuser || !record.get("role")) {
    record.set("role", "user");
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

  // Store the acceptances, once the user exists. The user is already created,
  // so don't fail the request when this fails: the user is then asked to
  // accept again after logging in.
  if (isSuperuser) {
    return;
  }
  try {
    if (privacyPolicy) {
      savePrivacyPolicyAcceptance(record.id, privacyPolicy);
    }
    if (borrowAgreement) {
      const acceptance = new Record(
        $app.findCollectionByNameOrId("borrow_agreement_acceptances")
      );
      acceptance.set("user", record.id);
      acceptance.set("borrow_agreement", borrowAgreement);
      $app.save(acceptance);
    }
  } catch (err) {
    console.error("[users] Failed to store the acceptances of sign-up:", err);
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

  // Fork-only: `borrower_terms_accepted` is kept as history of the retired
  // Operating Policy & Borrower Agreement checkbox, and can only be changed by
  // a superuser
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
