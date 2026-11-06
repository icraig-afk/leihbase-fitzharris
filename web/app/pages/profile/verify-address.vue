<template>
  <Container width="sm" centered>
    <PageAlert />
    <Card class="lb-stack">
      <Heading is="h1" size="xl" cap data-testid="verify-address-h1">
        {{ t("title") }}
      </Heading>

      <VerifyAddress>
        <template #verified>
          <Button to="/">{{ t("browse") }}</Button>
        </template>
      </VerifyAddress>

      <!-- Back button -->
      <Link to="/profile">{{ t("return") }}</Link>
    </Card>
  </Container>
</template>

<script setup lang="ts">
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Link from "@/components/core/Link.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";
import VerifyAddress from "@/components/VerifyAddress.vue";

const { pb, isValid, logout } = usePocketbase();
const userStore = useUserStore();
const { t } = useI18n({ useScope: "local" });

useHead({
  title: t("title"),
});

if (!isValid.value || !pb.authStore?.record?.id) {
  logout();
  userStore.logout();
  navigateTo("/login");
}
</script>

<i18n lang="json">
{
  "en": {
    "title": "Confirm your address",
    "browse": "Browse items",
    "return": "Return to profile"
  },
  "de": {
    "title": "Adresse bestätigen",
    "browse": "Gegenstände ansehen",
    "return": "Zurück zum Profil"
  }
}
</i18n>
