<template>
  <AgreementPage
    v-if="borrowAgreement"
    :title="t('title')"
    :agreement="borrowAgreement"
  />
</template>

<script setup lang="ts">
import AgreementPage from "@/components/AgreementPage.vue";
import type { BorrowAgreement } from "~~/models/borrowAgreement";

const { t } = useI18n({ useScope: "local" });
const { pb } = usePocketbase();
const { leihbase } = storeToRefs(useLeihbase());

// Current borrowing terms of the instance, for all locations
const { data: borrowAgreement } = await useAsyncData("borrowing_terms", () =>
  leihbase.value?.borrow_agreement
    ? pb
        .collection("borrow_agreements")
        .getOne<BorrowAgreement>(leihbase.value.borrow_agreement)
    : Promise.resolve(null)
);

if (!borrowAgreement.value) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found" });
}
</script>

<i18n lang="json">
{
  "en": {
    "title": "Borrowing terms"
  },
  "de": {
    "title": "Leihbedingungen"
  }
}
</i18n>
