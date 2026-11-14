<!--
  Fork-only: users close their own account (see pocketbase/pb_hooks/lib/retention.js)
-->

<template>
  <Container width="sm" centered>
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap>{{ t("title") }}</Heading>

      <template v-if="closed">
        <Alert variant="success" data-testid="account-closed">
          {{ t("closed") }}
        </Alert>
        <div>
          <Button to="/">{{ t("home") }}</Button>
        </div>
      </template>

      <template v-else>
        <p>{{ t("text") }}</p>
        <ul class="list">
          <li>{{ t("removed") }}</li>
          <li>{{ t("kept") }}</li>
          <li>{{ t("final") }}</li>
        </ul>
        <Alert v-if="error" variant="error" data-testid="close-account-error">
          {{ error }}
        </Alert>
        <div class="actions">
          <Button
            :loading="loading"
            data-testid="close-account-button"
            @click="handleClose"
          >
            {{ t("confirm") }}
          </Button>
          <Button variant="secondary" to="/profile">{{ t("cancel") }}</Button>
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
import { ClientResponseError } from "pocketbase";

const { t } = useI18n({ useScope: "local" });
const { pb, isValid, logout } = usePocketbase();
const userStore = useUserStore();

useHead({ title: t("title") });

if (!isValid.value) {
  await navigateTo({
    path: "/login",
    query: { return: "/profile/close-account" },
  });
}

const loading = ref(false);
const error = ref<string>();
const closed = ref(false);

async function handleClose() {
  loading.value = true;
  error.value = undefined;
  try {
    await pb.send("/api/account/close", { method: "POST" });
    logout();
    userStore.logout();
    closed.value = true;
  } catch (e) {
    error.value =
      e instanceof ClientResponseError &&
      e.message === "Account_has_open_reservation."
        ? t("errors.open_reservation")
        : t("errors.general");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.list {
  margin: 0;
  padding-left: 1.25rem;
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
    "title": "Close my account",
    "text": "Closing your account can't be undone. When you close it:",
    "removed": "Your name, email address, address and password are removed straight away, and you can no longer log in.",
    "kept": "We keep a record of which versions of our privacy policy and borrowing terms you accepted, for the time our privacy policy states, in case of a dispute. Your past reservations are kept without your name, and later anonymised.",
    "final": "To borrow again, you'll need to sign up again.",
    "confirm": "Close my account",
    "cancel": "Cancel",
    "closed": "Your account is closed and your personal data has been removed.",
    "home": "To the homepage",
    "errors": {
      "open_reservation": "You still have a reservation that isn't finished. Please return or cancel it first, then close your account.",
      "general": "Your account couldn't be closed. Please try again, or contact us."
    }
  },
  "de": {
    "title": "Mein Konto schließen",
    "text": "Das Schließen deines Kontos kann nicht rückgängig gemacht werden. Wenn du es schließt:",
    "removed": "Dein Name, deine E-Mail-Adresse, deine Adresse und dein Passwort werden sofort entfernt, und du kannst dich nicht mehr anmelden.",
    "kept": "Wir bewahren auf, welche Versionen unserer Datenschutzerklärung und Leihbedingungen du akzeptiert hast, so lange wie in unserer Datenschutzerklärung angegeben, für den Fall eines Streits. Deine früheren Reservierungen bleiben ohne deinen Namen erhalten und werden später anonymisiert.",
    "final": "Um wieder auszuleihen, musst du dich neu registrieren.",
    "confirm": "Mein Konto schließen",
    "cancel": "Abbrechen",
    "closed": "Dein Konto ist geschlossen und deine persönlichen Daten wurden entfernt.",
    "home": "Zur Startseite",
    "errors": {
      "open_reservation": "Du hast noch eine nicht abgeschlossene Reservierung. Bitte gib den Gegenstand zurück oder storniere die Reservierung, und schließe dann dein Konto.",
      "general": "Dein Konto konnte nicht geschlossen werden. Bitte versuche es erneut, oder kontaktiere uns."
    }
  }
}
</i18n>
