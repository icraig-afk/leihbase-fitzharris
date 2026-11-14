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

  e.next();

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
  }

  e.next();
}, "users");
