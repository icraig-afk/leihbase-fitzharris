<template>
  <Container width="lg" centered>
    <PageAlert />
    <header>
      <Heading is="h1" size="xl" class="heading" data-testid="search-h1">
        {{ t("title") }}
      </Heading>
    </header>
    <section>
      <ProductGrid
        v-if="locations.length > 0"
        :locations="locations"
        base-path="/search"
      />
      <p v-else>{{ t("no_locations") }}</p>
    </section>
  </Container>
</template>

<script lang="ts" setup>
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import ProductGrid from "@/components/modules/ProductGrid.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";
import type { Location } from "~~/models/location";

const { t } = useI18n({ useScope: "local" });
const { pb } = usePocketbase();
const { leihbase } = useLeihbase();

const { data } = await useAsyncData("search-locations", () =>
  pb.collection("public_locations").getFullList<Location>({
    filter: "active = true",
    sort: "name",
  })
);
const locations = computed(() => data.value ?? []);

useHead({
  title: `${t("title")} | ${leihbase.name}`,
});
</script>

<style lang="scss" scoped>
section {
  margin-bottom: var(--fluid-spacing-8);
}
.heading {
  margin-bottom: var(--fluid-spacing-8);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Search all locations",
    "no_locations": "There are no locations yet."
  },
  "de": {
    "title": "Alle Standorte durchsuchen",
    "no_locations": "Es gibt noch keine Standorte."
  }
}
</i18n>
