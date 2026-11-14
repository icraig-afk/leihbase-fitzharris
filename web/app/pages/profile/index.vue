<template>
  <Container width="sm" centered>
    <PageAlert />
    <Card class="lb-stack">
      <div class="heading row">
        <Heading is="h1" size="xl" cap data-testid="profile-h1">
          {{ t("profile") }}
        </Heading>
        <Button to="/profile/edit" size="md">{{ t("edit_profile") }}</Button>
      </div>
      <KeyValue :title="t('name')" :value="user?.name" />
      <KeyValue :title="t('email')" :value="user?.email" />
      <Alert v-if="!user?.verified" variant="warning" size="sm">
        <span>
          {{ t("unverified") }}
          <Link to="/profile/verify-email">{{ t("more_info") }}</Link
          >.
        </span>
      </Alert>
      <Alert
        v-if="leihbase?.address_verification && !user?.address_verified"
        variant="warning"
        size="sm"
        data-testid="address-unverified-alert"
      >
        <span>
          {{ t("address_unverified") }}
          <Link to="/profile/verify-address">{{ t("enter_code") }}</Link
          >.
        </span>
      </Alert>
      <!-- Fork-only: community requests -->
      <Switch
        v-if="isRequestsEnabled && user?.address_verified"
        id="community-requests-emails"
        v-model="requestEmails"
        :label="t('request_emails.label')"
        :description="t('request_emails.description')"
        data-testid="request-emails-switch"
      />
      <Divider spacing="md" />
      <p>
        <!-- <Link href="/profile/change-email">{{ t("change_email") }}</Link> -->
        <!-- <br /> -->
        <Link to="/profile/change-password">{{ t("change_password") }}</Link>
        <br />
        <Link to="/profile/close-account" data-testid="close-account-link">{{
          t("close_account")
        }}</Link>
      </p>
    </Card>
  </Container>
</template>

<script setup lang="ts">
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Divider from "@/components/core/Divider.vue";
import Heading from "@/components/core/Heading.vue";
import KeyValue from "@/components/core/KeyValue.vue";
import Link from "@/components/core/Link.vue";
import Switch from "@/components/core/Switch.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";

const { pb, isValid, user, logout } = usePocketbase();
const { isEnabled: isRequestsEnabled } = useCommunityRequests();

// Fork-only: emails about community requests, on unless opted out. Saved
// straight away.
const requestEmails = ref(!user.value?.community_requests_opt_out);
watch(requestEmails, async (value) => {
  if (!user.value?.id) return;
  await pb
    .collection("users")
    .update(user.value.id, { community_requests_opt_out: !value });
});
const { leihbase } = useLeihbase();
const userStore = useUserStore();
const { t } = useI18n({
  useScope: "local",
});

useHead({
  title: t("profile"),
});

if (!isValid.value || !user.value?.id) {
  logout();
  userStore.logout();
  navigateTo("/login");
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/_breakpoints.scss";

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

p:last-child {
  margin: 0;
}
</style>

<i18n lang="json">
{
  "en": {
    "profile": "Profile",
    "edit_profile": "Edit",
    "name": "Name",
    "email": "E-mail",
    "password": "Password",
    "unverified": "Your email address hasn't been confirmed yet.",
    "more_info": "More info",
    "address_unverified": "Your address hasn't been confirmed yet. We'll post you a letter with a code.",
    "enter_code": "Enter your code",
    "change_email": "Update e-mail",
    "change_password": "Update password",
    "close_account": "Close my account",
    "request_emails": {
      "label": "Email me when neighbours ask for items",
      "description": "When a neighbour asks the community for something, you get an email, and can say if you can help."
    },
    "logout": "Logout"
  },
  "de": {
    "profile": "Profil",
    "edit_profile": "Bearbeiten",
    "name": "Name",
    "email": "E-Mail Address",
    "password": "Passwort",
    "unverified": "Deine E-Mail-Adresse wurde noch nicht bestätigt.",
    "more_info": "Mehr Infos",
    "address_unverified": "Deine Adresse wurde noch nicht bestätigt. Wir schicken dir einen Brief mit einem Code.",
    "enter_code": "Code eingeben",
    "change_email": "E-Mail Address ändern",
    "change_password": "Passwort ändern",
    "close_account": "Mein Konto schließen",
    "request_emails": {
      "label": "E-Mail, wenn die Nachbarschaft nach etwas fragt",
      "description": "Wenn jemand aus der Nachbarschaft nach etwas fragt, bekommst du eine E-Mail und kannst sagen, ob du helfen kannst."
    },
    "logout": "Ausloggen"
  }
}
</i18n>
