<template>
  <Dialog
    v-model:open="isOpen"
    inset
    :title="t('title')"
    size="sm"
    data-testid="address-verification-dialog"
  >
    <div class="dialog">
      <VerifyAddress @verified="isOpen = false" />
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from "./core/Dialog.vue";
import VerifyAddress from "./VerifyAddress.vue";

const { t } = useI18n({ useScope: "local" });
const { isOpen } = useAddressVerificationDialog();
</script>

<i18n lang="json">
{
  "en": {
    "title": "Confirm your address"
  },
  "de": {
    "title": "Adresse bestätigen"
  }
}
</i18n>
