<!--
  Fork-only: stop the emails about community requests, from the link in an
  email. Opening the link changes nothing (mail scanners open links); only the
  button opts out.
-->

<template>
  <Container width="sm" centered>
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap>{{ t("title") }}</Heading>
      <Alert v-if="done" variant="success" data-testid="unsubscribed">
        {{ t("done") }}
      </Alert>
      <template v-else>
        <p>{{ t("text") }}</p>
        <Alert v-if="error" variant="error">{{ t("error") }}</Alert>
        <div>
          <Button
            :loading="loading"
            data-testid="unsubscribe-button"
            @click="handleUnsubscribe"
          >
            {{ t("confirm") }}
          </Button>
        </div>
      </template>
    </Card>
  </Container>
</template>

<script setup lang="ts">
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";

const { t } = useI18n({ useScope: "local" });
const route = useRoute();
const { pb } = usePocketbase();

useHead({ title: t("title") });

const token = typeof route.query.token === "string" ? route.query.token : "";
const loading = ref(false);
const done = ref(false);
const error = ref(false);

async function handleUnsubscribe() {
  loading.value = true;
  error.value = false;
  try {
    await pb.send("/api/community-requests/opt-out", {
      method: "POST",
      body: { token },
    });
    done.value = true;
  } catch (e) {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<i18n lang="json">
{
  "en": {
    "title": "Stop request emails",
    "text": "You won't get emails about your neighbours' requests any more. You can switch them on again on your profile at any time.",
    "confirm": "Stop these emails",
    "done": "Done: you won't get emails about neighbours' requests any more.",
    "error": "That didn't work. The link may be from an old email: you can also switch these emails off on your profile."
  },
  "de": {
    "title": "Keine Anfrage-E-Mails mehr",
    "text": "Du bekommst keine E-Mails mehr zu Anfragen aus der Nachbarschaft. Du kannst sie jederzeit in deinem Profil wieder einschalten.",
    "confirm": "Keine E-Mails mehr",
    "done": "Erledigt: Du bekommst keine E-Mails mehr zu Anfragen aus der Nachbarschaft.",
    "error": "Das hat nicht geklappt. Der Link stammt vielleicht aus einer alten E-Mail: Du kannst diese E-Mails auch in deinem Profil ausschalten."
  }
}
</i18n>
