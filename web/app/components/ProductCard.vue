<template>
  <component
    :is="component"
    :href="href"
    :to="to"
    :class="{ root: true, [`spacing-${spacing}`]: true }"
    :data-testid="`product-card-${product.id}`"
    :data-client-mounted="isClientMounted"
  >
    <ProductImage
      :src="
        product.images && product.images.length > 0
          ? `${config.public.pocketbase.clientBaseUrl}/api/files/products/${product.id}/${product.images[0]}${thumbs.sm}`
          : null
      "
      fallback="/images/fallback-product-image-600x600.png"
      aspect-ratio="1:1"
      border-radius="top"
      loading="lazy"
    >
      <slot name="image-overlay"></slot>
    </ProductImage>
    <div class="content">
      <sl-tooltip
        v-if="product.computedIsAvailable === false"
        :content="t('not_available')"
        distance="0"
      >
        <AvailabilityCircle class="availability-circle" :available="false" />
      </sl-tooltip>
      <slot>
        <div class="text">
          <p class="name">
            {{ product.name }}
          </p>
          <p
            v-if="locationName"
            class="location-name"
            :data-testid="`product-card-location-${product.id}`"
          >
            {{ locationName }}
          </p>
        </div>
      </slot>
    </div>
  </component>
</template>

<script setup lang="ts">
import type { RecordModel } from "pocketbase";
import type { HTMLAttributes } from "vue";
import AvailabilityCircle from "./AvailabilityCircle.vue";
import ProductImage from "./ProductImage.vue";

if (process.client) {
  await import("@shoelace-style/shoelace/dist/components/tooltip/tooltip.js");
}

const { t } = useI18n({ useScope: "local" });

/**
 * Native attributes (e.g. `@click`) which fall through to the root element.
 * Only used for type checking, see `@vue-ignore`.
 */
interface NativeAttributes extends HTMLAttributes {}

interface Props extends /* @vue-ignore */ NativeAttributes {
  product: RecordModel;
  to?: string;
  href?: string;
  spacing?: "sm" | "md";
  /** Shown under the product name, e.g. in results across locations */
  locationName?: string;
}

const props = withDefaults(defineProps<Props>(), { spacing: "md" });

const {
  product: { thumbs },
} = useAppConfig();

const config = useRuntimeConfig();

const { isClientMounted } = useClientMounted();

// Pick component type based on to/href property
const component = computed(() => {
  if (props.to || props.href) return resolveComponent("NuxtLink");
  return "button";
});
</script>

<style lang="scss" scoped>
.root {
  background-color: white;
  border-radius: var(--border-radius);
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.root:hover,
.root:active,
.root:focus {
  box-shadow: 0 0 0 2px var(--primary-color);
  outline: 0;
  border: 0;
}
.root:active {
  opacity: 0.8;
}
.content {
  padding: clamp(1rem, 4vw, 2rem);
  display: flex;
  width: 100%;
  align-items: center;
  line-height: 1;
}
.spacing-sm .content {
  padding: clamp(0.6rem, 4vw, 0.85rem) clamp(0.75rem, 4vw, 1rem);
}
.name {
  max-height: 1rem;
  margin-bottom: 0;
  line-height: 1;
  height: 1rem;
  box-sizing: content-box;
  text-overflow: ellipsis;
  overflow: hidden;
  padding-block: 0.5rem;
  margin-block: -0.5rem;
  white-space: nowrap;
  font-weight: var(--font-weight-bold);
}
.availability-circle {
  margin-right: 0.5rem;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}
.location-name {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-color-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<i18n lang="json">
{
  "en": {
    "not_available": "Currently not available"
  },
  "de": {
    "not_available": "Gerade nicht verfügbar"
  }
}
</i18n>
