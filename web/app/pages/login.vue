<template>
  <Container width="sm" centered>
    <Card class="card lb-stack">
      <Heading is="h1" size="xl" cap data-testid="login-h1">
        {{ t("title") }}
      </Heading>
      <i18n-t keypath="text" tag="p">
        <NuxtLink :to="signupLink" data-testid="signup-link">
          {{ t("signup_text") }}
        </NuxtLink>
      </i18n-t>
      <form @submit.prevent="onLogin">
        <Input
          label="E-mail"
          type="email"
          id="email"
          name="email"
          data-testid="email-input"
          required
          v-model="email"
        />
        <Input
          :label="t('password')"
          type="password"
          id="password"
          name="password"
          data-testid="password-input"
          required
          v-model="password"
        />
        <Alert
          v-if="!!authenticationError"
          variant="error"
          class="error"
          data-testid="login-error"
        >
          <i18n-t keypath="error" tag="span">
            <NuxtLink :to="signupLink">{{ t("error_signup") }}</NuxtLink>
          </i18n-t>
        </Alert>
        <Button
          :loading="loading"
          size="lg"
          type="submit"
          data-testid="submit-button"
        >
          {{ t("submit") }}
        </Button>
      </form>
    </Card>
    <footer>
      <NuxtLink :to="signupLink">{{ t("signup") }}</NuxtLink>
      •
      <a href="/reset-password">{{ t("forgot_password") }}</a>
    </footer>
  </Container>
</template>

<script lang="ts" setup>
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Input from "@/components/core/Input.vue";
import { PageAlertType } from "@/components/page-alert/PageAlert.model";
import { getReturnPath } from "~~/lib/returnPath";
import type { User } from "~~/models/user";

useHead({
  title: `Login`,
});

const { t } = useI18n({ useScope: "local" });

const route = useRoute();
const userStore = useUserStore();
const { pb, isValid, login } = usePocketbase();

const email = ref(null);
const password = ref(null);

const loading = ref(false);
const authenticationError = ref(false);

// If the 'return' query parameter is set in the url, set the authentication
// intent. Only pages of this website, see getReturnPath.
const returnPath = getReturnPath(route.query.return);
if (returnPath) {
  userStore.setAuthenticationIntent(null, returnPath);
}

// Keep the page to return to when switching to signing up
const signupLink = computed(() => ({
  path: "/signup",
  query: returnPath ? { return: returnPath } : {},
}));

async function onLogin() {
  authenticationError.value = false;
  loading.value = true;

  if (!email.value || !password.value) return;

  try {
    await login(email.value, password.value);
  } catch (e) {
    loading.value = false;
    authenticationError.value = true;
    return;
  }

  if (isValid.value) {
    userStore.login({ user: pb.authStore.record as User });
    // Show after-login banner on next page
    const { path, intent } = userStore.$state.authenticationIntent;
    if (path) {
      if (intent && intent === "reservation") {
        userStore.showBanner(PageAlertType.AFTER_LOGIN_RESERVATION_INTENT);
      } else {
        userStore.showBanner(PageAlertType.AFTER_LOGIN);
      }
      navigateTo(path);
    } else {
      // No page to return to: the homepage
      userStore.showBanner(PageAlertType.AFTER_LOGIN);
      navigateTo("/");
    }
  }
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/_breakpoints.scss";

form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
}
form sl-input {
  width: 100%;
}
.error {
  margin: 0;
}
footer {
  width: 100%;
  margin-block: 1rem;
  text-align: center;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Log in",
    "text": "No account yet? {0}, to create an account.",
    "signup_text": "Sign up",
    "password": "Password",
    "error": "Log in not successful, please review your account details, or {0} to create an account",
    "error_signup": "sign up",
    "submit": "Log in",
    "signup": "Sign up",
    "forgot_password": "Forgot password?"
  },
  "de": {
    "title": "Einloggen",
    "text": "Noch kein Konto? {0}, um ein Konto zu erstellen.",
    "signup_text": "Registriere dich",
    "password": "Passwort",
    "error": "Einloggen nicht erfolgreich, bitte überprüfe deine Kontodaten, oder {0} um ein Konto zu erstellen",
    "error_signup": "melde dich an",
    "submit": "Einloggen",
    "signup": "Registrieren",
    "forgot_password": "Passwort vergessen?"
  }
}
</i18n>
