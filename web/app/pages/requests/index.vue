<!--
  Fork-only: community requests. The user's own requests, with the answers,
  and the open requests of neighbours, to answer.
-->

<template>
  <Container width="lg" centered>
    <section class="lb-stack">
      <div class="heading">
        <Heading is="h1" size="xl">{{ t("title") }}</Heading>
        <Button
          v-if="canTakePart"
          to="/requests/new"
          data-testid="new-request-button"
        >
          {{ t("new") }}
        </Button>
      </div>
      <p class="intro">{{ t("intro") }}</p>
      <Alert
        v-if="route.query.sent"
        variant="success"
        data-testid="request-sent"
      >
        {{ t("sent") }}
      </Alert>
      <Alert v-if="loadError" variant="error" data-testid="requests-load-error">
        {{ t("load_error") }}
      </Alert>
      <Alert
        v-if="!canTakePart"
        variant="warning"
        data-testid="requests-unverified"
      >
        <span>
          {{ t("unverified") }}
          <Link
            :to="
              isEmailVerified
                ? '/profile/verify-address'
                : '/profile/verify-email'
            "
            >{{ t("verify") }}</Link
          >.
        </span>
      </Alert>
    </section>

    <!-- The user's own requests -->
    <section class="lb-stack">
      <Heading is="h2" size="lg">{{ t("mine") }}</Heading>
      <ul v-if="mine.length > 0" class="cards">
        <li
          v-for="request in mine"
          :key="request.id"
          class="card"
          data-testid="my-request"
        >
          <div class="row">
            <strong class="description">{{ request.description }}</strong>
            <Badge :variant="request.status === 'open' ? 'success' : 'error'">
              {{ t(`status.${request.status}`) }}
            </Badge>
          </div>
          <p class="muted">{{ needed(request) }}</p>

          <p v-if="yeses(request).length === 0" class="muted">
            <i>{{ t("no_answers") }}</i>
          </p>
          <ul v-else class="answers">
            <li
              v-for="response in yeses(request)"
              :key="response.id"
              data-testid="request-answer"
            >
              <strong>{{ response.responder_name }}</strong>
              <a :href="`mailto:${response.responder_email}`">{{
                response.responder_email
              }}</a>
              <span v-if="response.note" class="note"
                >“{{ response.note }}”</span
              >
            </li>
          </ul>

          <div v-if="request.status === 'open'">
            <Button
              variant="secondary"
              size="sm"
              :loading="closing === request.id"
              data-testid="close-request"
              @click="close(request)"
            >
              {{ t("close") }}
            </Button>
          </div>
        </li>
      </ul>
      <p v-else>
        <i>{{ t("no_requests") }}</i>
      </p>
    </section>

    <!-- Open requests of neighbours -->
    <section v-if="canTakePart" class="lb-stack">
      <Heading is="h2" size="lg">{{ t("neighbours") }}</Heading>
      <ul v-if="others.length > 0" class="cards">
        <li
          v-for="request in others"
          :key="request.id"
          class="card"
          data-testid="neighbour-request"
        >
          <strong class="description">{{ request.description }}</strong>
          <p class="muted">
            {{ t("asked_by", { name: request.requester_first_name }) }} ·
            {{ needed(request) }}
          </p>

          <p v-if="myAnswer(request)" class="muted" data-testid="my-answer">
            {{ t(`answered.${myAnswer(request)!.answer}`) }}
          </p>

          <template v-if="answering === request.id">
            <Textarea
              :id="`note-${request.id}`"
              v-model="note"
              :label="t('note')"
              :rows="2"
              data-testid="answer-note"
            />
            <div class="actions">
              <Button
                size="sm"
                :loading="sending"
                data-testid="answer-yes-confirm"
                @click="answer(request, 'yes')"
              >
                {{ t("send_yes") }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                @click="answering = undefined"
              >
                {{ t("cancel") }}
              </Button>
            </div>
          </template>
          <div v-else class="actions">
            <Button
              size="sm"
              data-testid="answer-yes"
              @click="startYes(request)"
            >
              {{ t("yes") }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              :loading="sending && answering === undefined"
              data-testid="answer-no"
              @click="answer(request, 'no')"
            >
              {{ t("no") }}
            </Button>
          </div>
        </li>
      </ul>
      <p v-else>
        <i>{{ t("no_neighbour_requests") }}</i>
      </p>
      <Alert v-if="error" variant="error">{{ error }}</Alert>
    </section>
  </Container>
</template>

<script setup lang="ts">
import { formatDate } from "@@/lib/date";
import Alert from "@/components/core/Alert.vue";
import Badge from "@/components/core/Badge.vue";
import Button from "@/components/core/Button.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Link from "@/components/core/Link.vue";
import Textarea from "@/components/core/Textarea.vue";
import type {
  CommunityRequest,
  CommunityRequestResponse,
} from "~~/models/communityRequest";

const { t } = useI18n({ useScope: "local" });
const formatLocale = useFormatLocale();
const route = useRoute();
const { pb, isValid, user } = usePocketbase();
const { isEnabled, isEmailVerified, canTakePart } = useCommunityRequests();

useHead({ title: t("title") });

if (!isEnabled.value) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found" });
}
if (!isValid.value) {
  await navigateTo({ path: "/login", query: { return: "/requests" } });
}

const userId = user.value?.id || "";

const {
  data,
  error: loadError,
  refresh,
} = await useAsyncData("community_requests", async () => {
  if (!userId) {
    return { mine: [], others: [], responses: [] };
  }
  // Parallel requests to the same collection: without a request key, the SDK
  // would cancel all but one
  const [mine, others, responses] = await Promise.all([
    pb.collection("community_requests").getFullList<CommunityRequest>({
      filter: pb.filter("requester = {:user}", { user: userId }),
      sort: "-created",
      requestKey: null,
    }),
    canTakePart.value
      ? pb.collection("community_requests").getFullList<CommunityRequest>({
          filter: pb.filter("requester != {:user} && status = 'open'", {
            user: userId,
          }),
          sort: "needed_until",
          requestKey: null,
        })
      : Promise.resolve([] as CommunityRequest[]),
    // Answers to the user's requests, and the user's own answers (as the
    // access rules allow)
    pb
      .collection("community_request_responses")
      .getFullList<CommunityRequestResponse>({
        sort: "created",
        requestKey: null,
      }),
  ]);
  return { mine, others, responses };
});

const mine = computed(() => data.value?.mine ?? []);
const others = computed(() => data.value?.others ?? []);

/** The answers to a request, that the user can see */
function responsesOf(request: CommunityRequest) {
  return (data.value?.responses ?? []).filter(
    (response) => response.request === request.id
  );
}

function needed(request: CommunityRequest) {
  return t("needed", {
    from: formatDate(request.needed_from, "DD.MM.YYYY", formatLocale.value),
    until: formatDate(request.needed_until, "DD.MM.YYYY", formatLocale.value),
  });
}

function yeses(request: CommunityRequest) {
  return responsesOf(request).filter((r) => r.answer === "yes");
}

/** The user's answer to a neighbour's request */
function myAnswer(request: CommunityRequest) {
  return responsesOf(request).find((r) => r.responder === userId);
}

const closing = ref<string>();
const answering = ref<string>();
const note = ref("");
const sending = ref(false);
const error = ref<string>();

async function close(request: CommunityRequest) {
  closing.value = request.id;
  try {
    await pb
      .collection("community_requests")
      .update(request.id, { status: "closed" });
    await refresh();
  } finally {
    closing.value = undefined;
  }
}

function startYes(request: CommunityRequest) {
  answering.value = request.id;
  note.value = myAnswer(request)?.note ?? "";
}

async function answer(request: CommunityRequest, value: "yes" | "no") {
  sending.value = true;
  error.value = undefined;
  try {
    await pb.send("/api/community-requests/respond-logged-in", {
      method: "POST",
      body: {
        request: request.id,
        answer: value,
        note: value === "yes" ? note.value : "",
      },
    });
    answering.value = undefined;
    note.value = "";
    await refresh();
  } catch (e) {
    error.value = t("answer_error");
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-3);
}
.intro,
.muted {
  margin: 0;
}
.muted {
  color: var(--text-color-light);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  gap: var(--fluid-spacing-4);
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
  border: 1px solid var(--input-border-color);
  border-radius: var(--border-radius);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-2);
}
.description {
  overflow-wrap: anywhere;
}
.answers {
  margin: 0;
  padding-left: 1.25rem;
}
.answers li {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--spacing-2);
}
.note {
  flex-basis: 100%;
  color: var(--text-color-light);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Requests",
    "intro": "Ask your neighbours for something no location lists, or help a neighbour out.",
    "new": "Ask the community",
    "sent": "Your request was sent to your neighbours. You'll get an email when someone can help.",
    "unverified": "Requests are open to verified neighbours only.",
    "verify": "Verify now",
    "mine": "My requests",
    "neighbours": "Requests from neighbours",
    "needed": "Needed {from} to {until}",
    "asked_by": "Asked by {name}",
    "status": { "open": "Open", "closed": "Closed" },
    "no_answers": "Nobody has said yes yet.",
    "no_requests": "You haven't asked for anything yet.",
    "no_neighbour_requests": "No open requests from neighbours right now.",
    "close": "Close request",
    "yes": "Yes, I can help",
    "no": "No",
    "note": "Note for your neighbour (optional)",
    "send_yes": "Send",
    "cancel": "Cancel",
    "answered": {
      "yes": "You said yes: your name and email address were sent to your neighbour.",
      "no": "You said no."
    },
    "answer_error": "Your answer couldn't be sent, possibly because the request closed. Please reload the page.",
    "load_error": "The requests couldn't be loaded. Please reload the page."
  },
  "de": {
    "title": "Anfragen",
    "intro": "Frag deine Nachbarschaft nach etwas, das kein Standort anbietet, oder hilf jemandem aus.",
    "new": "Die Nachbarschaft fragen",
    "sent": "Deine Anfrage wurde an die Nachbarschaft gesendet. Du bekommst eine E-Mail, wenn jemand helfen kann.",
    "unverified": "Anfragen sind nur für bestätigte Nachbar:innen möglich.",
    "verify": "Jetzt bestätigen",
    "mine": "Meine Anfragen",
    "neighbours": "Anfragen aus der Nachbarschaft",
    "needed": "Gebraucht {from} bis {until}",
    "asked_by": "Gefragt von {name}",
    "status": { "open": "Offen", "closed": "Geschlossen" },
    "no_answers": "Noch hat niemand Ja gesagt.",
    "no_requests": "Du hast noch nach nichts gefragt.",
    "no_neighbour_requests": "Gerade gibt es keine offenen Anfragen aus der Nachbarschaft.",
    "close": "Anfrage schließen",
    "yes": "Ja, ich kann helfen",
    "no": "Nein",
    "note": "Nachricht an deine Nachbar:in (optional)",
    "send_yes": "Senden",
    "cancel": "Abbrechen",
    "answered": {
      "yes": "Du hast Ja gesagt: Dein Name und deine E-Mail-Adresse wurden an deine Nachbar:in gesendet.",
      "no": "Du hast Nein gesagt."
    },
    "answer_error": "Deine Antwort konnte nicht gesendet werden, vielleicht weil die Anfrage geschlossen wurde. Bitte lade die Seite neu.",
    "load_error": "Die Anfragen konnten nicht geladen werden. Bitte lade die Seite neu."
  }
}
</i18n>
