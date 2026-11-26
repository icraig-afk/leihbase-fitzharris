<!--
  Public page of the current version of an instance-wide agreement: the privacy
  policy or the borrowing terms
-->

<template>
  <Container width="md" centered>
    <PageAlert />
    <article class="lb-stack">
      <Heading is="h1" size="xl">{{ title }}</Heading>
      <p v-if="agreement.updated" class="updated">
        {{
          t("updated", {
            date: formatDate(agreement.updated, "DD MMM YYYY", locale),
          })
        }}
      </p>
      <div
        class="lb-richtext"
        data-testid="agreement-content"
        v-html="agreement.content"
      ></div>
    </article>
  </Container>
</template>

<script setup lang="ts">
import { formatDate } from "@@/lib/date";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";

const props = defineProps<{
  title: string;
  agreement: { content: string; updated?: string };
}>();

const { t, locale } = useI18n({ useScope: "local" });

useHead({ title: props.title });
</script>

<style scoped>
.updated {
  margin: 0;
  color: var(--text-color-light);
}
</style>

<i18n lang="json">
{
  "en": {
    "updated": "Last updated on {date}"
  },
  "de": {
    "updated": "Zuletzt aktualisiert am {date}"
  }
}
</i18n>
