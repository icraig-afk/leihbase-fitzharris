/// <reference path="../pb_data/types.d.ts" />

// Frequently asked questions, shown on /faq and managed by admins on
// /admin/faq. Only published questions are visible to everyone.
migrate(
  (app) => {
    const faqs = new Collection({
      id: "pbc_1795400001",
      name: "faqs",
      type: "base",
      system: false,
      listRule: 'published = true || @request.auth.role = "admin"',
      viewRule: 'published = true || @request.auth.role = "admin"',
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
        {
          id: "text1795400011",
          name: "question",
          type: "text",
          required: true,
          max: 300,
        },
        {
          id: "editor1795400012",
          name: "answer",
          type: "editor",
          required: true,
          convertURLs: false,
        },
        {
          // For links to a question, e.g. /faq#deposits. Set from the
          // question when created (faq.record.pb.js), so links keep working
          // when the question is reworded.
          id: "text1795400013",
          name: "slug",
          type: "text",
          max: 80,
        },
        {
          id: "number1795400014",
          name: "position",
          type: "number",
          onlyInt: true,
        },
        { id: "bool1795400015", name: "published", type: "bool" },
        {
          id: "autodate1795400016",
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
        },
        {
          id: "autodate1795400017",
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: ["CREATE UNIQUE INDEX `idx_faqs_slug` ON `faqs` (`slug`)"],
    });
    app.save(faqs);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("pbc_1795400001"));
  }
);
