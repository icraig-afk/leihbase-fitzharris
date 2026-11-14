<template>
  <AgreementPage
    v-if="privacyPolicy"
    :title="t('title')"
    :agreement="privacyPolicy"
  />
</template>

<script setup lang="ts">
import AgreementPage from "@/components/AgreementPage.vue";
import type { PrivacyPolicy } from "~~/models/privacyPolicy";

const { t } = useI18n({ useScope: "local" });
const { pb } = usePocketbase();
const { leihbase } = storeToRefs(useLeihbase());

// Fork-only: the retention periods, as currently set
const { fill } = useRetentionPlaceholders();

// Current privacy policy
const { data: privacyPolicy } = await useAsyncData(
  "privacy_policy",
  async () => {
    if (!leihbase.value?.privacy_policy) {
      return null;
    }
    const privacyPolicy = await pb
      .collection("privacy_policies")
      .getOne<PrivacyPolicy>(leihbase.value.privacy_policy);
    return { ...privacyPolicy, content: await fill(privacyPolicy.content) };
  }
);

if (!privacyPolicy.value) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found" });
}
</script>

<i18n lang="json">
{
  "en": {
    "title": "Privacy policy"
  },
  "de": {
    "title": "Datenschutzerklärung"
  }
}
</i18n>
