<template>
  <div class="lb-stack">
    <!-- Already verified -->
    <template v-if="user?.address_verified">
      <Alert variant="success" data-testid="address-verified">
        {{ t("verified") }}
      </Alert>
      <slot name="verified"></slot>
    </template>

    <!-- Not yet verified -->
    <template v-else>
      <p>{{ t("text") }}</p>
      <form class="lb-stack" @submit.prevent="handleSubmit">
        <Input
          :id="inputId"
          :label="t('code')"
          v-model="code"
          placeholder="ABCD-EFGH"
          autocomplete="one-time-code"
          data-testid="address-code-input"
          required
        />
        <Alert v-if="error" variant="error" data-testid="address-code-error">
          {{ error }}
        </Alert>
        <Button
          type="submit"
          :loading="loading"
          data-testid="address-code-submit"
        >
          {{ t("submit") }}
        </Button>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ClientResponseError } from "pocketbase";
import Alert from "./core/Alert.vue";
import Button from "./core/Button.vue";
import Input from "./core/Input.vue";

const emit = defineEmits<{ verified: [] }>();

const { t } = useI18n({ useScope: "local" });
const { pb, user } = usePocketbase();

// Unique, as the component is used on the page and in the dialog
const inputId = `address-code-${useId()}`;
const code = ref("");
const error = ref("");
const loading = ref(false);

const errorKeys: Record<string, string> = {
  "Code_invalid.": "errors.invalid",
  "Code_expired.": "errors.expired",
  "Too_many_attempts.": "errors.too_many_attempts",
};

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await pb.send("/api/address-verification/redeem", {
      method: "POST",
      body: { code: code.value },
    });
    await pb.collection("users").authRefresh();
    emit("verified");
  } catch (e) {
    const message = e instanceof ClientResponseError ? e.data?.message : "";
    if (message === "Already_verified.") {
      await pb.collection("users").authRefresh();
      emit("verified");
    } else {
      error.value = t(errorKeys[message] ?? "errors.general");
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
    "text": "We posted a letter with a code to your address. Enter it here to start reserving.",
    "code": "Code from your letter",
    "submit": "Confirm address",
    "verified": "Your address is confirmed. You can now reserve items.",
    "errors": {
      "invalid": "This code isn't valid. Check it against your letter and try again.",
      "expired": "This code has expired. Please contact us for a new letter.",
      "too_many_attempts": "Too many wrong attempts. Please contact us for a new letter.",
      "general": "Something went wrong, please try again."
    }
  },
  "de": {
    "text": "Wir haben dir einen Brief mit einem Code geschickt. Gib ihn hier ein, um zu reservieren.",
    "code": "Code aus deinem Brief",
    "submit": "Adresse bestätigen",
    "verified": "Deine Adresse ist bestätigt. Du kannst jetzt Gegenstände reservieren.",
    "errors": {
      "invalid": "Dieser Code ist ungültig. Vergleiche ihn mit deinem Brief und versuche es erneut.",
      "expired": "Dieser Code ist abgelaufen. Bitte kontaktiere uns für einen neuen Brief.",
      "too_many_attempts": "Zu viele falsche Versuche. Bitte kontaktiere uns für einen neuen Brief.",
      "general": "Es ist ein Fehler aufgetreten, bitte versuche es erneut."
    }
  }
}
</i18n>
