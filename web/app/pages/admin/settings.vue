<!--
  Instance settings: settings for all locations, for admins
-->

<template>
  <Container width="lg" centered>
    <PageAlert class="banner" />

    <div class="header lb-stack">
      <Link to="/admin">{{ t("back") }}</Link>
      <Heading is="h1" size="xl">{{ t("title") }}</Heading>
    </div>

    <form method="POST" @submit.prevent="handleSubmit">
      <AdminSection
        :title="t('privacy-policy.title')"
        :description="t('privacy-policy.description')"
      >
        <AgreementEditor
          ref="privacyPolicyEditor"
          kind="privacy_policy"
          :agreement="privacyPolicy"
        />
        <!-- Fork-only: placeholders for the data retention periods -->
        <p class="placeholders" data-testid="retention-placeholders">
          {{ t("placeholders") }}
          <template
            v-for="(placeholder, index) in retentionPlaceholders"
            :key="placeholder"
          >
            <code>{{ placeholder }}</code
            >{{ index < retentionPlaceholders.length - 1 ? ", " : "." }}
          </template>
        </p>
        <div v-if="privacyPolicy">
          <NuxtLink to="/privacy" target="_blank" class="link">{{
            t("view-page")
          }}</NuxtLink>
        </div>
      </AdminSection>

      <AdminSection
        :title="t('borrow-agreement.title')"
        :description="t('borrow-agreement.description')"
      >
        <AgreementEditor
          ref="borrowAgreementEditor"
          kind="borrow_agreement"
          :agreement="borrowAgreement"
        />
        <div v-if="borrowAgreement">
          <NuxtLink to="/borrowing-terms" target="_blank" class="link">{{
            t("view-page")
          }}</NuxtLink>
        </div>
      </AdminSection>

      <AdminSection>
        <Alert v-if="error" variant="error">{{ t("error") }}</Alert>
        <Alert v-if="success" variant="success">{{ t("success") }}</Alert>
        <div>
          <Button type="submit" :loading="loading" data-testid="save-button">
            {{ t("save") }}
          </Button>
        </div>
      </AdminSection>
    </form>
  </Container>
</template>

<script setup lang="ts">
import AdminSection from "@/components/admin/AdminSection.vue";
import AgreementEditor from "@/components/admin/AgreementEditor.vue";
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Link from "@/components/core/Link.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";
import { POLICY_PLACEHOLDERS } from "@/composables/useRetentionPlaceholders";
import type { BorrowAgreement } from "~~/models/borrowAgreement";
import type { PrivacyPolicy } from "~~/models/privacyPolicy";

const { t } = useI18n({ useScope: "local" });
const { pb, isValid } = usePocketbase();
const userStore = useUserStore();
const leihbaseStore = useLeihbase();
const { leihbase } = storeToRefs(leihbaseStore);

if (!isValid.value) {
  await navigateTo({ path: "/login", query: { return: "/admin/settings" } });
}
if (!userStore.isAdmin) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found" });
}

useHead({
  title: `${t("title")} | ${leihbase.value?.name}`,
});

const { data: privacyPolicy } = await useAsyncData(
  "admin_instance_privacy_policy",
  async () =>
    leihbase.value?.privacy_policy
      ? await pb
          .collection("privacy_policies")
          .getOne<PrivacyPolicy>(leihbase.value.privacy_policy)
      : null
);
const { data: borrowAgreement } = await useAsyncData(
  "admin_instance_borrow_agreement",
  async () =>
    leihbase.value?.borrow_agreement
      ? await pb
          .collection("borrow_agreements")
          .getOne<BorrowAgreement>(leihbase.value.borrow_agreement)
      : null
);

// Fork-only: the placeholders, as written in the privacy policy
const retentionPlaceholders = POLICY_PLACEHOLDERS;

const privacyPolicyEditor = ref<InstanceType<typeof AgreementEditor>>();
const borrowAgreementEditor = ref<InstanceType<typeof AgreementEditor>>();
const loading = ref(false);
const success = ref(false);
const error = ref(false);

async function handleSubmit() {
  loading.value = true;
  success.value = false;
  error.value = false;
  try {
    if (privacyPolicyEditor.value) {
      privacyPolicy.value =
        (await privacyPolicyEditor.value.save()) as PrivacyPolicy | null;
    }
    if (borrowAgreementEditor.value) {
      borrowAgreement.value =
        (await borrowAgreementEditor.value.save()) as BorrowAgreement | null;
    }
    await pb.collection("leihbase").update(leihbase.value.id, {
      privacy_policy: privacyPolicy.value?.id || "",
      borrow_agreement: borrowAgreement.value?.id || "",
    });
    // Sign-up, locations and the reservation dialog read the instance settings
    await leihbaseStore.fetch();
    success.value = true;
  } catch (e) {
    console.error("Error saving the instance settings", e);
    error.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.header {
  margin-bottom: var(--fluid-spacing-8);
}
.placeholders {
  margin: 0;
  max-width: 36rem;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
}
/* Like the Link component, which doesn't support opening in a new tab */
.link {
  color: var(--text-color);
  text-decoration: underline;
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Instance settings",
    "back": "Back to the admin",
    "privacy-policy": {
      "title": "Privacy policy",
      "description": "Users accept the privacy policy when signing up, and are asked to accept it again after it changes. Shown on the /privacy page. Leave empty to use the privacy policy link instead, if set."
    },
    "borrow-agreement": {
      "title": "Borrowing terms",
      "description": "Borrowing terms of all locations, unless a location has borrowing terms of its own. Users accept them when signing up, and again after they change. Shown on the /borrowing-terms page. Leave empty to not use instance-wide borrowing terms."
    },
    "view-page": "View the page",
    "placeholders": "Instead of fixed values, you can use these placeholders, which show the name of the library and the data retention periods as currently set:",
    "success": "Settings saved.",
    "error": "The settings couldn't be saved, please try again.",
    "save": "Save"
  },
  "de": {
    "title": "Instanz-Einstellungen",
    "back": "Zurück zur Verwaltung",
    "privacy-policy": {
      "title": "Datenschutzerklärung",
      "description": "Nutzer akzeptieren die Datenschutzerklärung bei der Registrierung, und werden nach Änderungen gebeten, sie erneut zu akzeptieren. Wird auf der Seite /privacy angezeigt. Leer lassen, um stattdessen den Link zur Datenschutzerklärung zu verwenden, falls gesetzt."
    },
    "borrow-agreement": {
      "title": "Leihbedingungen",
      "description": "Leihbedingungen aller Standorte, außer ein Standort hat eigene Leihbedingungen. Nutzer akzeptieren sie bei der Registrierung, und erneut nach Änderungen. Wird auf der Seite /borrowing-terms angezeigt. Leer lassen, um keine instanzweiten Leihbedingungen zu verwenden."
    },
    "view-page": "Seite ansehen",
    "placeholders": "Statt fester Werte kannst du diese Platzhalter verwenden, die den Namen der Bibliothek und die aktuell eingestellten Aufbewahrungsfristen anzeigen:",
    "success": "Einstellungen gespeichert.",
    "error": "Die Einstellungen konnten nicht gespeichert werden, bitte versuche es erneut.",
    "save": "Speichern"
  }
}
</i18n>
