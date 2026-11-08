<template>
  <Container width="sm" centered>
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap data-testid="confirm-password-reset-h1">
        {{ t("title") }}
      </Heading>

      <template v-if="success">
        <Alert variant="success" data-testid="password-reset-success">
          {{ t("success") }}
        </Alert>
        <Button to="/login">{{ t("to_login") }}</Button>
      </template>

      <template v-else>
        <p v-if="token">{{ t("text") }}</p>
        <Alert v-if="error" variant="error" data-testid="password-reset-error">
          {{ error }}
        </Alert>
        <form v-if="token" class="lb-stack" @submit.prevent="handleSubmit">
          <Input
            id="password-reset-password-input"
            v-model="password"
            :label="t('password')"
            type="password"
            autocomplete="new-password"
            data-testid="password-input"
            required
          />
          <Input
            id="password-reset-password-confirm-input"
            v-model="passwordConfirm"
            :label="t('password_confirm')"
            type="password"
            autocomplete="new-password"
            data-testid="password-confirm-input"
            required
          />
          <Button type="submit" :loading="loading" data-testid="submit-button">
            {{ t("submit") }}
          </Button>
        </form>
        <Link to="/reset-password">{{ t("request_new") }}</Link>
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
import Input from "@/components/core/Input.vue";
import Link from "@/components/core/Link.vue";
import { ClientResponseError } from "pocketbase";

const route = useRoute();
const { pb } = usePocketbase();
const { t } = useI18n({ useScope: "local" });

useHead({
  title: t("title"),
});

const token = (route.query.token as string) || "";
const password = ref("");
const passwordConfirm = ref("");
const success = ref(false);
const loading = ref(false);
const error = ref(token ? "" : t("errors.no_token"));

async function handleSubmit() {
  error.value = "";
  if (password.value !== passwordConfirm.value) {
    error.value = t("errors.mismatch");
    return;
  }
  loading.value = true;
  try {
    await pb
      .collection("users")
      .confirmPasswordReset(token, password.value, passwordConfirm.value);
    success.value = true;
  } catch (e) {
    const data =
      e instanceof ClientResponseError ? (e.response?.data ?? {}) : {};
    if (data.token) {
      error.value = t("errors.invalid_token");
    } else if (data.password?.code === "validation_length_out_of_range") {
      error.value = t("errors.password_length");
    } else {
      error.value = t("errors.general");
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
p {
  margin: 0;
}
form {
  align-items: flex-start;
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Choose a new password",
    "text": "Enter a new password for your account.",
    "password": "New password",
    "password_confirm": "Confirm new password",
    "submit": "Save new password",
    "success": "Your password has been changed. You can now log in with your new password.",
    "to_login": "Log in",
    "request_new": "Request a new reset link",
    "errors": {
      "no_token": "This link is incomplete. Please use the link from your e-mail, or request a new one.",
      "invalid_token": "This link is invalid or has expired. Please request a new one.",
      "mismatch": "The passwords don't match.",
      "password_length": "Your password should be at least 8 characters long.",
      "general": "Something went wrong, please try again."
    }
  },
  "de": {
    "title": "Neues Passwort festlegen",
    "text": "Gib ein neues Passwort für dein Konto ein.",
    "password": "Neues Passwort",
    "password_confirm": "Neues Passwort bestätigen",
    "submit": "Neues Passwort speichern",
    "success": "Dein Passwort wurde geändert. Du kannst dich jetzt mit deinem neuen Passwort einloggen.",
    "to_login": "Einloggen",
    "request_new": "Neuen Link anfordern",
    "errors": {
      "no_token": "Dieser Link ist unvollständig. Bitte nutze den Link aus deiner E-Mail oder fordere einen neuen an.",
      "invalid_token": "Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.",
      "mismatch": "Die Passwörter stimmen nicht überein.",
      "password_length": "Dein Passwort sollte mindestens 8 Zeichen lang sein.",
      "general": "Es ist ein Fehler aufgetreten, bitte versuche es erneut."
    }
  }
}
</i18n>
