<template>
  <div>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { openKey, toggleKey } from "./Accordion.model";

const { single } = defineProps<{
  // If only one accordion item can be open at the same time
  single?: boolean;
}>();

// Ids of the open items. Optionally bound with `v-model:open`, e.g. to open an
// item from the URL.
const open = defineModel<string[]>("open", { default: () => [] });

function toggle(id: string) {
  if (!open.value.includes(id)) {
    open.value = single ? [id] : [...open.value, id];
    return;
  }
  open.value = open.value.filter((openId) => openId !== id);
}

provide(openKey, open);
provide(toggleKey, toggle);
</script>

<style scoped>
div {
  display: grid;
  grid-auto-rows: auto;
  gap: var(--fluid-spacing-2);
}
</style>
