/// <reference path="../pb_data/types.d.ts" />

// Fork-only: community requests. Address-verified neighbours ask the community
// for an item no location lists ("Does anyone have 2 screws?"). Neighbours who
// take part are emailed, and answer yes or no; a yes reaches the requester
// only. Enabled with `community_requests` on the leihbase record, together
// with `address_verification`. See lib/communityRequests.js.

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

// Members who take part: a verified email address and address
const PARTICIPANT =
  "@request.auth.verified = true && @request.auth.address_verified = true";

migrate(
  (app) => {
    const requests = new Collection({
      id: "pbc_1795300001",
      name: "community_requests",
      type: "base",
      system: false,
      listRule: `@request.auth.id != "" && (requester = @request.auth.id || @request.auth.role = "admin" || (status = "open" && ${PARTICIPANT}))`,
      viewRule: `@request.auth.id != "" && (requester = @request.auth.id || @request.auth.role = "admin" || (status = "open" && ${PARTICIPANT}))`,
      // Further checks in community_requests.pb.js
      createRule: `requester = @request.auth.id && ${PARTICIPANT}`,
      updateRule: 'requester = @request.auth.id || @request.auth.role = "admin"',
      deleteRule: null,
      fields: [
        ID_FIELD,
        {
          id: "relation1795300011",
          name: "requester",
          type: "relation",
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          // Shown to neighbours, who can't see the requester's account
          id: "text1795300012",
          name: "requester_first_name",
          type: "text",
          max: 100,
        },
        {
          id: "text1795300013",
          name: "description",
          type: "text",
          required: true,
          max: 500,
        },
        {
          id: "date1795300014",
          name: "needed_from",
          type: "date",
          required: true,
        },
        {
          id: "date1795300015",
          name: "needed_until",
          type: "date",
          required: true,
        },
        {
          id: "select1795300016",
          name: "status",
          type: "select",
          maxSelect: 1,
          values: ["open", "closed"],
        },
        { id: "date1795300017", name: "closed_at", type: "date" },
        {
          id: "select1795300018",
          name: "closed_reason",
          type: "select",
          maxSelect: 1,
          values: ["requester", "expired", "admin", "account_closed"],
        },
        ...autodates("179530001"),
      ],
      indexes: [
        "CREATE INDEX `idx_community_requests_status` ON `community_requests` (`status`, `needed_until`)",
      ],
    });
    app.save(requests);

    const responses = new Collection({
      id: "pbc_1795300002",
      name: "community_request_responses",
      type: "base",
      system: false,
      listRule:
        'responder = @request.auth.id || request.requester = @request.auth.id || @request.auth.role = "admin"',
      viewRule:
        'responder = @request.auth.id || request.requester = @request.auth.id || @request.auth.role = "admin"',
      // Answered through the routes in community_requests.pb.js
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        ID_FIELD,
        {
          id: "relation1795300021",
          name: "request",
          type: "relation",
          collectionId: "pbc_1795300001",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          id: "relation1795300022",
          name: "responder",
          type: "relation",
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          // For the requester, who can't see the responder's account
          id: "text1795300023",
          name: "responder_name",
          type: "text",
          max: 200,
        },
        {
          id: "text1795300024",
          name: "responder_email",
          type: "text",
          max: 300,
        },
        {
          id: "select1795300025",
          name: "answer",
          type: "select",
          maxSelect: 1,
          values: ["yes", "no"],
          required: true,
        },
        { id: "text1795300026", name: "note", type: "text", max: 500 },
        ...autodates("179530002"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_community_request_responses_unique` ON `community_request_responses` (`request`, `responder`)",
      ],
    });
    app.save(responses);

    // Emails to neighbours, sent within the daily cap. The token in the email
    // authorises answering and opting out, and is only stored hashed.
    const deliveries = new Collection({
      id: "pbc_1795300003",
      name: "community_request_deliveries",
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        ID_FIELD,
        {
          id: "relation1795300031",
          name: "request",
          type: "relation",
          collectionId: "pbc_1795300001",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        {
          id: "relation1795300032",
          name: "recipient",
          type: "relation",
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          maxSelect: 1,
          required: true,
        },
        { id: "text1795300033", name: "token_hash", type: "text", max: 64 },
        { id: "date1795300034", name: "sent_at", type: "date" },
        ...autodates("179530003"),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_community_request_deliveries_unique` ON `community_request_deliveries` (`request`, `recipient`)",
        "CREATE INDEX `idx_community_request_deliveries_token` ON `community_request_deliveries` (`token_hash`)",
      ],
    });
    app.save(deliveries);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    users.fields.add(
      new Field({
        id: "bool1795300041",
        name: "community_requests_opt_out",
        type: "bool",
        help: "Don't email this user about community requests",
      })
    );
    app.save(users);

    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    leihbase.fields.add(
      new Field({
        id: "bool1795300051",
        name: "community_requests",
        type: "bool",
        help: "Let address-verified neighbours ask the community for items. Needs address_verification on too.",
      })
    );
    leihbase.fields.add(
      new Field({
        id: "number1795300052",
        name: "community_requests_daily_cap",
        type: "number",
        min: 0,
        onlyInt: true,
        help: "At most this many request emails a day, the rest go out the next day. Empty or 0: 80. Keep it below your email provider's daily limit.",
      })
    );
    leihbase.fields.add(
      new Field({
        id: "number1795300053",
        name: "retention_request_days",
        type: "number",
        min: 0,
        onlyInt: true,
        help: "Days after a community request closed to delete it, with its answers, e.g. 90. Empty or 0: never.",
      })
    );
    app.save(leihbase);
  },
  (app) => {
    const leihbase = app.findCollectionByNameOrId("gu30h2m0sajzw6p");
    for (const id of [
      "bool1795300051",
      "number1795300052",
      "number1795300053",
    ]) {
      leihbase.fields.removeById(id);
    }
    app.save(leihbase);

    const users = app.findCollectionByNameOrId("_pb_users_auth_");
    users.fields.removeById("bool1795300041");
    app.save(users);

    app.delete(app.findCollectionByNameOrId("pbc_1795300003"));
    app.delete(app.findCollectionByNameOrId("pbc_1795300002"));
    app.delete(app.findCollectionByNameOrId("pbc_1795300001"));
  }
);
