<!--
  Review and accept changed instance-wide agreements: the privacy policy and
  the borrowing terms of all locations
-->

<template>
  <Container width="md" centered>
    <PageAlert />
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap>{{ t("title") }}</Heading>
      <p>{{ t("text") }}</p>

      <form class="lb-stack" @submit.prevent="handleSubmit">
        <section
          v-for="item in outstanding"
          :key="item.kind"
          class="agreement lb-stack"
          :data-testid="`agreement-${item.kind}`"
        >
          <Heading is="h2" size="lg">{{ t(`${item.kind}.title`) }}</Heading>
          <p class="updated">
            {{
              t("updated", {
                date: formatDate(item.agreement.updated, "DD MMM YYYY", locale),
              })
            }}
          </p>
          <div
            class="content lb-richtext"
            v-html="item.agreement.content"
          ></div>
          <Checkbox
            :id="`accept-${item.kind}`"
            v-model="accepted[item.kind]"
            required
            :data-testid="`accept-${item.kind}`"
          >
            {{ t(`${item.kind}.accept`) }}
          </Checkbox>
        </section>

        <Alert v-if="error" variant="error">{{ t("error") }}</Alert>
        <div class="actions">
          <Button
            type="submit"
            :loading="loading"
            :disabled="!allAccepted"
            data-testid="accept-agreements"
          >
            {{ t("accept") }}
          </Button>
          <Button
            variant="secondary"
            data-testid="logout"
            @click="handleLogout"
          >
            {{ t("logout") }}
          </Button>
        </div>
      </form>
    </Card>
  </Container>
</template>

<script setup lang="ts">
import { formatDate } from "@@/lib/date";
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Checkbox from "@/components/core/Checkbox.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";

const { t, locale } = useI18n({ useScope: "local" });
const route = useRoute();
const { pb, isValid, logout } = usePocketbase();
const userStore = useUserStore();
const { getOutstanding, accept } = useAgreements();

useHead({ title: t("title") });

// Return to the page the user was going to, only within this website
const returnPath = computed(() => {
  const path = route.query.return;
  return typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//")
    ? path
    : "/profile";
});

const userId = pb.authStore.record?.id;
if (!isValid.value || !userId) {
  await navigateTo({ path: "/login", query: { return: route.fullPath } });
}

const { data: outstanding } = await useAsyncData(
  "agreements_outstanding",
  () => (userId ? getOutstanding(userId) : Promise.resolve([]))
);

// Nothing to accept (anymore)
if (userId && outstanding.value?.length === 0) {
  await navigateTo(returnPath.value);
}

const accepted = reactive<Record<string, boolean>>({});
const allAccepted = computed(
  () =>
    !!outstanding.value?.length &&
    outstanding.value.every((item) => accepted[item.kind])
);
const loading = ref(false);
const error = ref(false);

async function handleSubmit() {
  if (!userId || !outstanding.value || !allAccepted.value) return;
  loading.value = true;
  error.value = false;
  try {
    for (const item of outstanding.value) {
      await accept(userId, item);
    }
    // Check again: an agreement may have changed in the meantime
    if ((await getOutstanding(userId)).length > 0) {
      error.value = true;
      return;
    }
    await navigateTo(returnPath.value);
  } catch (e) {
    console.error("Error accepting the agreements", e);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function handleLogout() {
  logout();
  userStore.logout();
  await navigateTo("/");
}
</script>

<style scoped>
.agreement {
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--input-border-color);
}
.updated {
  margin: 0;
  color: var(--text-color-light);
}
.content {
  max-height: 24rem;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  border: 1px solid var(--input-border-color);
  border-radius: var(--border-radius);
  background-color: var(--input-background-color);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-4);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Updated terms",
    "text": "We've updated the documents below. Please read and accept them to continue using your account.",
    "updated": "Last updated on {date}",
    "privacy_policy": {
      "title": "Privacy policy",
      "accept": "I have read and agree to the privacy policy."
    },
    "borrow_agreement": {
      "title": "Borrowing terms",
      "accept": "I have read and agree to the borrowing terms."
    },
    "accept": "Accept and continue",
    "logout": "Log out instead",
    "error": "Accepting didn't work, possibly because the documents changed in the meantime. Please reload the page and try again."
  },
  "de": {
    "title": "Aktualisierte Bedingungen",
    "text": "Wir haben die folgenden Dokumente aktualisiert. Bitte lies und akzeptiere sie, um dein Konto weiter zu nutzen.",
    "updated": "Zuletzt aktualisiert am {date}",
    "privacy_policy": {
      "title": "Datenschutzerklärung",
      "accept": "Ich habe die Datenschutzerklärung gelesen und bin damit einverstanden."
    },
    "borrow_agreement": {
      "title": "Leihbedingungen",
      "accept": "Ich habe die Leihbedingungen gelesen und bin damit einverstanden."
    },
    "accept": "Akzeptieren und weiter",
    "logout": "Stattdessen abmelden",
    "error": "Das Akzeptieren hat nicht geklappt, möglicherweise weil sich die Dokumente inzwischen geändert haben. Bitte lade die Seite neu und versuche es erneut."
  }
}
</i18n>
