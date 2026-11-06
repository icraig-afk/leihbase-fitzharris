/// <reference path="../pb_data/types.d.ts" />

/**
 * Lists users who still need to verify their address with a posted code.
 * Admins only.
 */
routerAdd(
  "GET",
  "/api/address-verification/pending",
  (e) => {
    /** @type {typeof import('./lib/addressVerification')} */
    const { findActiveCode, getAddress } = require(
      `${__hooks}/lib/addressVerification`
    );

    if (!e.hasSuperuserAuth() && e.auth?.get("role") !== "admin") {
      throw new ForbiddenError("Admins_only.");
    }

    const users = $app.findRecordsByFilter(
      "users",
      'address_verified = false && role = "user"',
      "created",
      0,
      0
    );

    const items = [];
    for (const user of users) {
      if (!user) continue;
      const code = findActiveCode(user.id);
      items.push({
        id: user.id,
        name: user.getString("name"),
        email: user.getString("email"),
        created: user.getString("created"),
        ...getAddress(user),
        code_issued: code ? code.getString("created") : null,
        code_expires: code ? code.getString("expires") : null,
      });
    }

    return e.json(200, { items });
  },
  $apis.requireAuth()
);

/**
 * Creates a new one-time code for a user, replacing any earlier unused code,
 * and returns it once together with the letter data. Admins only.
 */
routerAdd(
  "POST",
  "/api/address-verification/{userId}/issue",
  (e) => {
    /** @type {typeof import('./lib/addressVerification')} */
    const {
      CODE_VALID_DAYS,
      generateCode,
      formatCode,
      hashCode,
      toPocketbaseDate,
      getAddress,
    } = require(`${__hooks}/lib/addressVerification`);

    if (!e.hasSuperuserAuth() && e.auth?.get("role") !== "admin") {
      throw new ForbiddenError("Admins_only.");
    }

    let user;
    try {
      user = $app.findRecordById("users", e.request?.pathValue("userId") ?? "");
    } catch (_) {
      throw new NotFoundError("User_not_found.");
    }
    if (user.getBool("address_verified")) {
      throw new BadRequestError("Already_verified.");
    }

    const now = new Date();
    const expires = new Date(now.getTime() + CODE_VALID_DAYS * 864e5);
    const code = generateCode();

    $app.runInTransaction((txApp) => {
      // Invalidate earlier unused codes, e.g. of a lost letter
      const previous = txApp.findRecordsByFilter(
        "address_codes",
        'user = {:user} && used = ""',
        "",
        0,
        0,
        { user: user.id }
      );
      previous.forEach((record) => {
        if (!record) return;
        record.set("used", toPocketbaseDate(now));
        txApp.save(record);
      });

      const record = new Record(
        txApp.findCollectionByNameOrId("address_codes")
      );
      record.set("user", user.id);
      record.set("code_hash", hashCode(code));
      record.set("expires", toPocketbaseDate(expires));
      record.set("attempts", 0);
      txApp.save(record);
    });

    return e.json(200, {
      code: formatCode(code),
      expires: toPocketbaseDate(expires),
      name: user.getString("name"),
      ...getAddress(user),
    });
  },
  $apis.requireAuth()
);

/**
 * Verifies the address of the authenticated user with the code from the
 * letter.
 */
routerAdd(
  "POST",
  "/api/address-verification/redeem",
  (e) => {
    /** @type {typeof import('./lib/addressVerification')} */
    const {
      MAX_ATTEMPTS,
      normalizeCode,
      hashCode,
      toPocketbaseDate,
      findActiveCode,
    } = require(`${__hooks}/lib/addressVerification`);

    const auth = e.auth;
    if (!auth || auth.collection().name !== "users") {
      throw new ForbiddenError("Users_only.");
    }
    const user = $app.findRecordById("users", auth.id);
    if (user.getBool("address_verified")) {
      throw new BadRequestError("Already_verified.");
    }

    const input = normalizeCode(e.requestInfo().body["code"]);
    const code = findActiveCode(user.id);
    if (!input || !code) {
      throw new BadRequestError("Code_invalid.");
    }
    if (new Date(code.getString("expires").replace(" ", "T")) < new Date()) {
      throw new BadRequestError("Code_expired.");
    }
    if (code.getInt("attempts") >= MAX_ATTEMPTS) {
      throw new BadRequestError("Too_many_attempts.");
    }

    // Count the attempt before comparing, so guessing is limited
    code.set("attempts", code.getInt("attempts") + 1);
    $app.save(code);

    if (!$security.equal(hashCode(input), code.getString("code_hash"))) {
      throw new BadRequestError("Code_invalid.");
    }

    const now = toPocketbaseDate(new Date());
    $app.runInTransaction((txApp) => {
      code.set("used", now);
      txApp.save(code);
      user.set("address_verified", true);
      user.set("address_verified_at", now);
      txApp.save(user);
    });

    return e.json(200, { verified: true });
  },
  $apis.requireAuth()
);
