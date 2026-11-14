<!--
  Fork-only: ask the community for an item
-->

<template>
  <Container width="sm" centered>
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap>{{ t("title") }}</Heading>

      <Alert
        v-if="!isEmailVerified"
        variant="warning"
        data-testid="requests-unverified"
      >
        <span>
          {{ t("email_unverified") }}
          <Link to="/profile/verify-email">{{ t("verify_email") }}</Link
          >.
        </span>
      </Alert>
      <Alert
        v-else-if="!isAddressVerified"
        variant="warning"
        data-testid="requests-unverified"
      >
        <span>
          {{ t("address_unverified") }}
          <Link to="/profile/verify-address">{{ t("enter_code") }}</Link
          >.
        </span>
      </Alert>

      <form v-else class="lb-stack" @submit.prevent="handleSubmit">
        <p class="intro">{{ t("intro") }}</p>
        <Textarea
          id="request-description"
          v-model="description"
          :label="t('description')"
          :placeholder="t('placeholder')"
          :rows="3"
          required
          data-testid="request-description"
        />
        <DateInput
          id="request-needed-from"
          v-model="neededFrom"
          :label="t('needed_from')"
          :is-date-disallowed="(date: Date) => toShortISO(date) < today"
          data-testid="request-needed-from"
          required
        />
        <DateInput
          id="request-needed-until"
          v-model="neededUntil"
          :label="t('needed_until')"
          :description="t('needed_until_description')"
          :is-date-disallowed="isUntilDisallowed"
          data-testid="request-needed-until"
          required
        />
        <Alert v-if="error" variant="error" data-testid="request-error">
          {{ error }}
        </Alert>
        <div class="actions">
          <Button type="submit" :loading="loading" data-testid="request-submit">
            {{ t("submit") }}
          </Button>
          <Button variant="secondary" to="/requests">{{ t("cancel") }}</Button>
        </div>
      </form>
    </Card>
  </Container>
</template>

<script setup lang="ts">
import { toShortISO } from "@@/lib/date";
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import DateInput from "@/components/core/DateInput.vue";
import Heading from "@/components/core/Heading.vue";
import Link from "@/components/core/Link.vue";
import Textarea from "@/components/core/Textarea.vue";
import { ClientResponseError } from "pocketbase";

const { t } = useI18n({ useScope: "local" });
const { pb, isValid, user } = usePocketbase();
const { isEnabled, isEmailVerified, isAddressVerified } =
  useCommunityRequests();

useHead({ title: t("title") });

if (!isEnabled.value) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found" });
}
if (!isValid.value) {
  await navigateTo({ path: "/login", query: { return: "/requests/new" } });
}

/** Requests can't be needed for longer than this ahead, as on the server */
const MAX_DAYS_AHEAD = 90;
const today = toShortISO(new Date());
const latest = toShortISO(
  new Date(Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000)
);

const description = ref("");
const neededFrom = ref<Date | undefined>(new Date());
const neededUntil = ref<Date>();
const loading = ref(false);
const error = ref<string>();

function isUntilDisallowed(date: Date) {
  const day = toShortISO(date);
  return (
    day < today ||
    day > latest ||
    (!!neededFrom.value && day < toShortISO(neededFrom.value))
  );
}

const ERRORS: Record<string, string> = {
  "Too_many_open_requests.": "errors.too_many",
  "Invalid_dates.": "errors.dates",
  "Description_required.": "errors.description",
  "Not_a_participant.": "errors.not_participant",
};

async function handleSubmit() {
  error.value = undefined;
  if (!neededFrom.value || !neededUntil.value) {
    error.value = t("errors.dates");
    return;
  }
  loading.value = true;
  try {
    await pb.collection("community_requests").create({
      requester: user.value?.id,
      description: description.value,
      needed_from: toShortISO(neededFrom.value),
      needed_until: toShortISO(neededUntil.value),
    });
    await navigateTo({ path: "/requests", query: { sent: "1" } });
  } catch (e) {
    const key =
      e instanceof ClientResponseError ? ERRORS[e.message] : undefined;
    error.value = t(key || "errors.general");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.intro {
  margin: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Ask the community",
    "intro": "Need something no location lists, like a couple of screws or a tool for an afternoon? Ask your neighbours. We email the request to neighbours who take part, with your first name. When someone can help, you get an email with their name and email address, to arrange it together.",
    "description": "What do you need?",
    "placeholder": "e.g. 2 wood screws, 4 × 40 mm",
    "needed_from": "Needed from",
    "needed_until": "No longer needed after",
    "needed_until_description": "The request closes after this day.",
    "submit": "Send to neighbours",
    "cancel": "Cancel",
    "email_unverified": "Please confirm your email address before asking the community.",
    "verify_email": "More info",
    "address_unverified": "Requests are open to verified neighbours only. Please confirm your address with the code from your letter first.",
    "enter_code": "Enter your code",
    "errors": {
      "too_many": "You already have 3 open requests. Please close one before asking for something else.",
      "dates": "Please choose when you need it, and until when. The request can be open for at most 90 days.",
      "description": "Please describe what you need.",
      "not_participant": "Requests are open to verified neighbours only.",
      "general": "Your request couldn't be sent, please try again."
    }
  },
  "de": {
    "title": "Die Nachbarschaft fragen",
    "intro": "Du brauchst etwas, das kein Standort anbietet, z. B. ein paar Schrauben oder ein Werkzeug für einen Nachmittag? Frag deine Nachbarschaft. Wir schicken die Anfrage mit deinem Vornamen an die Nachbar:innen, die teilnehmen. Wenn jemand helfen kann, bekommst du eine E-Mail mit Name und E-Mail-Adresse, um es gemeinsam zu vereinbaren.",
    "description": "Was brauchst du?",
    "placeholder": "z. B. 2 Holzschrauben, 4 × 40 mm",
    "needed_from": "Gebraucht ab",
    "needed_until": "Nicht mehr gebraucht nach",
    "needed_until_description": "Die Anfrage wird nach diesem Tag geschlossen.",
    "submit": "An die Nachbarschaft senden",
    "cancel": "Abbrechen",
    "email_unverified": "Bitte bestätige deine E-Mail-Adresse, bevor du die Nachbarschaft fragst.",
    "verify_email": "Mehr Infos",
    "address_unverified": "Anfragen sind nur für bestätigte Nachbar:innen möglich. Bitte bestätige zuerst deine Adresse mit dem Code aus deinem Brief.",
    "enter_code": "Code eingeben",
    "errors": {
      "too_many": "Du hast bereits 3 offene Anfragen. Bitte schließe eine, bevor du nach etwas anderem fragst.",
      "dates": "Bitte wähle, ab wann und bis wann du es brauchst. Eine Anfrage kann höchstens 90 Tage offen sein.",
      "description": "Bitte beschreibe, was du brauchst.",
      "not_participant": "Anfragen sind nur für bestätigte Nachbar:innen möglich.",
      "general": "Deine Anfrage konnte nicht gesendet werden, bitte versuche es erneut."
    }
  }
}
</i18n>
