<template>
  <Container width="sm" centered>
    <Card class="card lb-stack">
      <Heading is="h1" size="xl" cap data-testid="signup-h1">
        {{ t("title") }}
      </Heading>
      <i18n-t keypath="text" tag="p">
        <NuxtLink to="/login">{{ t("login_text") }}</NuxtLink>
      </i18n-t>
      <form @submit.prevent="handleSubmit" method="post">
        <Input
          id="name"
          name="name"
          :label="t('name')"
          type="text"
          data-testid="name-input"
          required
        />
        <Input
          id="email"
          name="email"
          :label="t('email')"
          type="email"
          data-testid="email-input"
          required
        />
        <Input
          id="password"
          name="password"
          :label="t('password')"
          type="password"
          data-testid="password-input"
          required
        />
        <template v-if="leihbase.address_verification">
          <p class="address-info">{{ t("address_info") }}</p>
          <Select
            v-model="street"
            name="street"
            :label="t('street')"
            data-testid="street-select"
            required
          >
            <option value="">{{ t("street_placeholder") }}</option>
            <option
              v-for="street in streets"
              :key="street.id"
              :value="street.id"
            >
              {{ street.name }}
            </option>
          </Select>
          <Input
            id="house_number"
            name="house_number"
            :label="t('house_number')"
            type="text"
            autocomplete="address-line1"
            data-testid="house-number-input"
            required
          />
          <Input
            id="address_extra"
            name="address_extra"
            :label="t('address_extra')"
            type="text"
            autocomplete="address-line2"
            data-testid="address-extra-input"
          />
        </template>
        <fieldset v-if="leihbase.privacy_policy_link" class="checkbox">
          <input
            id="terms-and-conditions"
            name="terms"
            type="checkbox"
            data-testid="tac-checkbox"
            value="true"
            required
          />
          <label for="terms-and-conditions">
            <i18n-t keypath="terms_and_conditions" tag="span">
              <NuxtLink target="_blank" :to="leihbase.privacy_policy_link">{{
                t("terms_and_conditions_link")
              }}</NuxtLink>
            </i18n-t>
          </label>
        </fieldset>

        <cap-widget
          v-if="cap.instanceHost && cap.siteKey"
          id="floating"
          :data-cap-api-endpoint="`https://${cap.instanceHost}/${cap.siteKey}/`"
        ></cap-widget>

        <sl-alert
          v-if="!!signupError"
          variant="danger"
          :open="!!signupError"
          data-testid="signup-error"
        >
          <sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
          {{ signupError }}
        </sl-alert>
        <Button
          :loading="loading"
          size="lg"
          type="submit"
          data-testid="submit-button"
          data-cap-floating="#floating"
          data-cap-floating-position="bottom"
        >
          {{ t("submit") }}
        </Button>
      </form>
    </Card>
  </Container>
</template>

<script lang="ts" setup>
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Input from "@/components/core/Input.vue";
import Select from "@/components/core/Select.vue";
import { PageAlertType } from "@/components/page-alert/PageAlert.model";
import type { Street } from "~~/models/street";
import type { User } from "~~/models/user";
import { ClientResponseError } from "pocketbase";

const { t } = useI18n({ useScope: "local" });
const { pb, login } = usePocketbase();
const userStore = useUserStore();
const { leihbase } = useLeihbase();

const {
  public: { cap },
} = useRuntimeConfig();

const signupError = ref<string>();
const loading = ref(false);

// Selected street, empty to show the placeholder option
const street = ref("");

// Streets users can sign up from, when neighbour verification is enabled
const { data: streets } = await useAsyncData("signup-streets", () =>
  leihbase.address_verification
    ? pb.collection("streets").getFullList<Street>({
        filter: "active = true",
        sort: "name",
      })
    : Promise.resolve([] as Street[])
);

if (import.meta.client) {
  await import("@shoelace-style/shoelace/dist/components/alert/alert.js");
  await import("@shoelace-style/shoelace/dist/components/icon/icon.js");

  if (cap.instanceHost && cap.siteKey) {
    await import("https://cdn.jsdelivr.net/npm/cap-widget@0.1.52");
    await import("https://cdn.jsdelivr.net/npm/cap-widget@0.1.52/cap-floating.min.js");
  }
}

useHead({
  title: t("page_title"),
});

async function handleSubmit(e: SubmitEvent) {
  const data = new FormData(e.target as HTMLFormElement);
  data.set("passwordConfirm", data.get("password") || "");
  signupError.value = undefined;
  loading.value = true;

  try {
    // Create account
    await pb.collection("users").create(data);

    // Send an email verification request
    await pb
      .collection("users")
      .requestVerification(data.get("email")!.toString());

    // Authenticate
    await login(
      data.get("email")!.toString(),
      data.get("password")!.toString()
    );

    // Login
    userStore.login({ user: pb.authStore.record as User });

    // Routing
    const { path, intent } = userStore.$state.authenticationIntent;
    if (path) {
      if (leihbase.address_verification) {
        // Reserving is only possible after entering the posted code
        userStore.showBanner(PageAlertType.AFTER_SIGNUP_ADDRESS_VERIFICATION);
      } else if (intent && intent === "reservation") {
        userStore.showBanner(PageAlertType.AFTER_SIGNUP_RESERVATION_INTENT);
      } else {
        userStore.showBanner(PageAlertType.AFTER_SIGNUP);
      }
      navigateTo(path);
    } else {
      userStore.showBanner(
        leihbase.address_verification
          ? PageAlertType.AFTER_SIGNUP_ADDRESS_VERIFICATION
          : PageAlertType.AFTER_SIGNUP
      );
      navigateTo("/profile");
    }
  } catch (e) {
    console.log(e);
    loading.value = false;
    if (
      e instanceof ClientResponseError &&
      e.data?.data?.password?.code === "validation_length_out_of_range"
    ) {
      signupError.value = t("errors.password_length");
    } else if (
      e instanceof ClientResponseError &&
      e.data?.data?.email?.code === "validation_invalid_email"
    ) {
      signupError.value = t("errors.invalid_email");
    } else if (
      e instanceof ClientResponseError &&
      e.data?.data?.email?.code === "validation_not_unique"
    ) {
      signupError.value = t("errors.email_in_use");
    } else if (
      e instanceof ClientResponseError &&
      e.data?.message === "Terms_required."
    ) {
      signupError.value = t("errors.terms_required");
    } else if (
      e instanceof ClientResponseError &&
      e.data?.data?.message === "Captcha_invalid."
    ) {
      signupError.value = t("errors.captcha_invalid");
    } else if (
      e instanceof ClientResponseError &&
      e.data?.message === "Address_required."
    ) {
      signupError.value = t("errors.address_required");
    } else if (
      e instanceof ClientResponseError &&
      e.data?.message === "Street_not_allowed."
    ) {
      signupError.value = t("errors.street_not_allowed");
    } else {
      signupError.value = t("errors.general");
    }
  }
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/_breakpoints.scss";

form {
  max-width: var(--max-text-width);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
}
form sl-input {
  width: 100%;
}
sl-alert::part(base) {
  width: 100%;
}

.address-info {
  margin: 0;
}

fieldset.checkbox {
  border: 0;
  padding: 0.5rem 0;
  width: 100%;
  input {
    margin-right: 0.5rem;
  }
}
</style>

<i18n lang="json">
{
  "en": {
    "page_title": "Sign up",
    "title": "Sign up",
    "text": "Already have an account? {0}.",
    "login_text": "Sign in",
    "name": "Name",
    "email": "E-Mail",
    "password": "Password",
    "submit": "Sign up",
    "terms_and_conditions": "I have read and agree to the {0}, for the use of my personal data.",
    "terms_and_conditions_link": "data protection information",
    "address_info": "Sign-up is open to neighbours on our streets. We'll post a code to your address, which you enter here before your first reservation.",
    "street": "Street",
    "street_placeholder": "Choose your street",
    "house_number": "House number",
    "address_extra": "Flat or unit",

    "errors": {
      "address_required": "Please choose your street and enter your house number.",
      "street_not_allowed": "Sign-up is only open to the listed streets.",
      "password_ength": "Password should be at least 8 characters long.",
      "invalid_email": "E-mail address is invalid or already in use.",
      "email_in_use": "There is already an account with this e-mail address.",
      "terms_required": "To proceed, you must agree to the data protection terms.",
      "captcha": "The website couldn't verify your request, please try again or contact us to resolve the issue.",
      "general": "An error occured during sign up, please try again."
    }
  },
  "de": {
    "page_title": "Registrieren",
    "title": "Registrieren",
    "text": "Du hast bereits ein Konto? {0}.",
    "login_text": "Einloggen",
    "name": "Name",
    "email": "E-Mail",
    "password": "Passwort",
    "terms_and_conditions": "Ich habe die {0}, zur Nutzung meiner personenbezogenen Daten gelesen und bin damit einverstanden.",
    "terms_and_conditions_link": "Datenschutzhinweisen",
    "submit": "Registrieren",
    "address_info": "Die Registrierung steht Nachbar:innen aus unseren Straßen offen. Wir schicken dir einen Code per Post, den du vor deiner ersten Reservierung hier eingibst.",
    "street": "Straße",
    "street_placeholder": "Wähle deine Straße",
    "house_number": "Hausnummer",
    "address_extra": "Wohnung",
    "errors": {
      "address_required": "Bitte wähle deine Straße und gib deine Hausnummer ein.",
      "street_not_allowed": "Die Registrierung ist nur für die aufgeführten Straßen möglich.",
      "password_length": "Dein Passwort sollte mindestens 8 Zeichen lang sein.",
      "invalid_email": "Die E-Mail ist ungültig oder wird bereits verwendet.",
      "email_in_use": "Es gibt bereits ein Konto mit dieser E-Mail-Adresse.",
      "terms_required": "Um fortzufahren, musst du den Datenschutzbestimmungen zustimmen.",
      "captcha": "Die Website konnte deine Anfrage nicht verifizieren. Versuch's bitte nochmal oder kontaktiere uns, um das Problem zu klären.",
      "general": "Beim Erstellen deiner Account ist ein Fehler aufgetreten, bitte versuche es erneut."
    }
  }
}
</i18n>
