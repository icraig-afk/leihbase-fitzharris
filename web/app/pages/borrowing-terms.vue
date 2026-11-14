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

// Fork-only: the retention periods, as currently set
const { fill } = useRetentionPlaceholders();

// Current borrowing terms of the instance, for all locations
const { data: borrowAgreement } = await useAsyncData(
  "borrowing_terms",
  async () => {
    if (!leihbase.value?.borrow_agreement) {
      return null;
    }
    const borrowAgreement = await pb
      .collection("borrow_agreements")
      .getOne<BorrowAgreement>(leihbase.value.borrow_agreement);
    return { ...borrowAgreement, content: await fill(borrowAgreement.content) };
  }
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
