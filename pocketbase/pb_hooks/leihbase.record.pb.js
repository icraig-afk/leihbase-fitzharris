/// <reference path="../pb_data/types.d.ts" />

onRecordUpdateRequest((e) => {
  // Fields admins (non-superusers) are allowed to update
  const ADMIN_EDITABLE_FIELDS = ["borrow_agreement"];

  const { record } = e;
  if (!record) {
    throw new BadRequestError("Record_not_defined.");
  }

  if (!e.hasSuperuserAuth()) {
    const body = e.requestInfo().body;
    const forbiddenFields = Object.keys(body).filter(
      (field) => ADMIN_EDITABLE_FIELDS.indexOf(field) === -1
    );
    if (forbiddenFields.length > 0) {
      throw new ForbiddenError("Field_not_editable.", {
        fields: forbiddenFields,
      });
    }
  }

  // The instance-wide borrow agreement can't belong to a location
  const borrowAgreementId = record.getString("borrow_agreement");
  if (borrowAgreementId) {
    const borrowAgreement = $app.findRecordById(
      "borrow_agreements",
      borrowAgreementId
    );
    if (borrowAgreement.getString("location")) {
      throw new BadRequestError("Borrow_agreement_of_location.");
    }
  }

  e.next();
}, "leihbase");
