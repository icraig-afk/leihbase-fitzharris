<!--
  Fork-only: answer a community request from the email, without logging in.
  Opening the link changes nothing (mail scanners open links); only the button
  sends the answer.
-->

<template>
  <Container width="sm" centered>
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap>{{ t("title") }}</Heading>

      <Alert v-if="!request" variant="error" data-testid="respond-invalid">
        {{ t("invalid") }}
      </Alert>

      <template v-else>
        <p class="muted">
          {{ t("asked_by", { name: request.requester_first_name }) }} ·
          {{ needed }}
        </p>
        <blockquote class="description" data-testid="respond-description">
          {{ request.description }}
        </blockquote>

        <Alert
          v-if="request.status !== 'open'"
          variant="info"
          data-testid="respond-closed"
        >
          {{ t("closed") }}
        </Alert>

        <Alert v-else-if="sent" variant="success" data-testid="respond-sent">
          {{ t(`sent.${answer}`) }}
        </Alert>

        <form v-else class="lb-stack" @submit.prevent="handleSubmit">
          <!-- The radios' change events bubble up to here -->
          <div class="radios" @change="handleAnswerChange">
            <RadioBox
              id="respond-yes"
              name="answer"
              value="yes"
              :title="t('yes.title')"
              :checked="answer === 'yes'"
              data-testid="respond-yes"
            >
              {{ t("yes.text") }}
            </RadioBox>
            <RadioBox
              id="respond-no"
              name="answer"
              value="no"
              :title="t('no.title')"
              :checked="answer === 'no'"
              data-testid="respond-no"
            >
              {{ t("no.text") }}
            </RadioBox>
          </div>
          <Textarea
            v-if="answer === 'yes'"
            id="respond-note"
            v-model="note"
            :label="t('note')"
            :rows="3"
            data-testid="respond-note"
          />
          <Alert v-if="error" variant="error">{{ error }}</Alert>
          <div>
            <Button
              type="submit"
              :loading="loading"
              :disabled="!answer"
              data-testid="respond-submit"
            >
              {{ t("submit") }}
            </Button>
          </div>
        </form>

        <p class="muted">
          <Link
            :to="`/requests/unsubscribe?token=${encodeURIComponent(token)}`"
            >{{ t("unsubscribe") }}</Link
          >
        </p>
      </template>
    </Card>
  </Container>
</template>

<script setup lang="ts">
import { formatDate } from "@@/lib/date";
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Link from "@/components/core/Link.vue";
import RadioBox from "@/components/core/RadioBox.vue";
import Textarea from "@/components/core/Textarea.vue";

type Delivery = {
  requester_first_name: string;
  description: string;
  needed_from: string;
  needed_until: string;
  status: "open" | "closed";
  answer: "yes" | "no" | null;
  note: string;
};

const { t, locale } = useI18n({ useScope: "local" });
const route = useRoute();
const { pb } = usePocketbase();

useHead({ title: t("title") });

const token = typeof route.query.token === "string" ? route.query.token : "";

const { data: request } = await useAsyncData(
  "community_request_delivery",
  () =>
    token
      ? pb
          .send<Delivery>("/api/community-requests/delivery", {
            query: { token },
          })
          .catch(() => null)
      : Promise.resolve(null)
);

// Preselected from the link in the email, or the earlier answer
const answer = ref<"yes" | "no" | undefined>(
  route.query.answer === "yes" || route.query.answer === "no"
    ? route.query.answer
    : request.value?.answer || undefined
);
const note = ref(request.value?.note || "");
const loading = ref(false);
const sent = ref(false);
const error = ref<string>();

const needed = computed(() =>
  request.value
    ? t("needed", {
        from: formatDate(request.value.needed_from, "DD.MM.YYYY", locale.value),
        until: formatDate(
          request.value.needed_until,
          "DD.MM.YYYY",
          locale.value
        ),
      })
    : ""
);

function handleAnswerChange(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  if (value === "yes" || value === "no") {
    answer.value = value;
  }
}

async function handleSubmit() {
  if (!answer.value) return;
  loading.value = true;
  error.value = undefined;
  try {
    await pb.send("/api/community-requests/respond", {
      method: "POST",
      body: {
        token,
        answer: answer.value,
        note: answer.value === "yes" ? note.value : "",
      },
    });
    sent.value = true;
  } catch (e) {
    error.value = t("error");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.muted {
  margin: 0;
  color: var(--text-color-light);
}
.description {
  margin: 0;
  padding: var(--spacing-3) var(--spacing-4);
  border-left: 3px solid var(--input-border-color);
  overflow-wrap: anywhere;
}
.radios {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "A neighbour's request",
    "asked_by": "Asked by {name}",
    "needed": "Needed {from} to {until}",
    "invalid": "This link doesn't work. It may be from an old email, or the request was deleted.",
    "closed": "This request is closed, so it can't be answered any more. Thank you anyway!",
    "yes": {
      "title": "Yes, I can help",
      "text": "Your name, email address and note are sent to your neighbour, to arrange it together."
    },
    "no": {
      "title": "No, sorry",
      "text": "Nothing is sent to your neighbour."
    },
    "note": "Note for your neighbour (optional), e.g. when they can pick it up",
    "submit": "Send my answer",
    "sent": {
      "yes": "Thank you! Your neighbour got your name and email address, and will be in touch.",
      "no": "Thanks for letting us know."
    },
    "error": "Your answer couldn't be sent, possibly because the request closed. Please reload the page.",
    "unsubscribe": "Stop emails about neighbours' requests"
  },
  "de": {
    "title": "Eine Anfrage aus der Nachbarschaft",
    "asked_by": "Gefragt von {name}",
    "needed": "Gebraucht {from} bis {until}",
    "invalid": "Dieser Link funktioniert nicht. Er stammt vielleicht aus einer alten E-Mail, oder die Anfrage wurde gelöscht.",
    "closed": "Diese Anfrage ist geschlossen und kann nicht mehr beantwortet werden. Trotzdem danke!",
    "yes": {
      "title": "Ja, ich kann helfen",
      "text": "Dein Name, deine E-Mail-Adresse und deine Nachricht werden an deine Nachbar:in gesendet, um es gemeinsam zu vereinbaren."
    },
    "no": {
      "title": "Nein, leider nicht",
      "text": "Deine Nachbar:in bekommt nichts."
    },
    "note": "Nachricht an deine Nachbar:in (optional), z. B. wann sie es abholen kann",
    "submit": "Antwort senden",
    "sent": {
      "yes": "Danke! Deine Nachbar:in hat deinen Namen und deine E-Mail-Adresse bekommen und meldet sich.",
      "no": "Danke für deine Rückmeldung."
    },
    "error": "Deine Antwort konnte nicht gesendet werden, vielleicht weil die Anfrage geschlossen wurde. Bitte lade die Seite neu.",
    "unsubscribe": "Keine E-Mails mehr zu Anfragen aus der Nachbarschaft"
  }
}
</i18n>
