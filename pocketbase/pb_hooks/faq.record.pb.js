/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const { record } = e;
  if (!record) {
    throw new BadRequestError("Record_not_defined.");
  }

  // Link to the question, e.g. /faq#how-do-deposits-work. Unique, and kept when
  // the question is reworded later.
  const base =
    record
      .getString("question")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "question";
  let slug = base;
  for (let i = 2; ; i++) {
    const existing = $app.findRecordsByFilter(
      "faqs",
      "slug = {:slug}",
      "",
      1,
      0,
      { slug }
    );
    if (existing.length === 0) {
      break;
    }
    slug = `${base}-${i}`;
  }
  record.set("slug", slug);

  // New questions go last, unless a position is given
  if (!record.getInt("position")) {
    const last = $app.findRecordsByFilter("faqs", "", "-position", 1, 0)[0];
    record.set("position", (last ? last.getInt("position") : 0) + 1);
  }

  e.next();
}, "faqs");

onRecordUpdateRequest((e) => {
  const { record } = e;
  if (!record) {
    throw new BadRequestError("Record_not_defined.");
  }
  // Links to the question keep working: only superusers change the slug
  if (!e.hasSuperuserAuth()) {
    record.set("slug", record.original().getString("slug"));
  }
  e.next();
}, "faqs");
