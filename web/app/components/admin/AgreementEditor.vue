<!--
  Editor of a versioned agreement: the borrowing terms of a location or of the
  instance, or the privacy policy. Saving creates a new version, which users
  have to accept again, unless saved as a minor edit.
-->

<template>
  <div class="editor" :data-testid="`${testId}-editor`">
    <RichTextarea
      :label="t(`${kind}.label`)"
      v-model="content"
      :headings="[3, 4]"
      height="24rem"
      class="max-w"
    />
    <Switch
      v-if="agreement && content && isEdited"
      :id="`${testId}-minor-edit`"
      v-model="isMinorEdit"
      :label="t('minor-edit')"
      :description="t(`${kind}.minor-edit`)"
      :data-testid="`${testId}-minor-edit`"
    />
  </div>
</template>

<script setup lang="ts">
import RichTextarea from "@/components/core/RichTextarea.vue";
import Switch from "@/components/core/Switch.vue";
import type { RecordModel } from "pocketbase";

type Agreement = RecordModel & { id: string; content: string };

const props = defineProps<{
  kind: "borrow_agreement" | "privacy_policy";
  /** The current version, if any */
  agreement: Agreement | null | undefined;
  /** Location of new borrow agreements, empty for the instance */
  location?: string;
}>();

const COLLECTIONS = {
  borrow_agreement: "borrow_agreements",
  privacy_policy: "privacy_policies",
} as const;

const { t } = useI18n({ useScope: "local" });
const { pb } = usePocketbase();
const testId = computed(() => props.kind.replace("_", "-"));

const content = ref<string | undefined>(props.agreement?.content);
// If the content has been edited since loading or saving, even when it ended
// up the same
const isEdited = ref(false);
watch(content, () => {
  isEdited.value = true;
});
const isMinorEdit = ref(false);

/**
 * Saves the content. A minor edit updates the current version in place,
 * otherwise a new version is created, which users have to accept again.
 * Returns the current version, `null` when emptied.
 */
async function save(): Promise<Agreement | null> {
  const collection = pb.collection(COLLECTIONS[props.kind]);
  const current = props.agreement || null;
  const newContent = content.value || "";
  let saved = current;
  if (newContent === (current?.content || "")) {
    saved = current;
  } else if (!newContent) {
    saved = null;
  } else if (isMinorEdit.value && current) {
    saved = await collection.update<Agreement>(current.id, {
      content: newContent,
    });
  } else {
    saved = await collection.create<Agreement>({
      content: newContent,
      ...(props.kind === "borrow_agreement"
        ? { location: props.location || "" }
        : {}),
    });
  }
  isMinorEdit.value = false;
  isEdited.value = false;
  return saved;
}

defineExpose({
  save,
  /** If there is content, so the agreement will be used */
  hasContent: computed(() => !!content.value),
});
</script>

<style scoped>
/* Lay out the fields as if they were children of the parent */
.editor {
  display: contents;
}
.max-w {
  max-width: 36rem;
}
</style>

<i18n lang="json">
{
  "en": {
    "minor-edit": "Minor edit",
    "borrow_agreement": {
      "label": "Borrowing terms",
      "minor-edit": "Users who accepted the borrowing terms don't have to accept them again. Only use this for small corrections, like typos. Without this, all users have to accept the changed borrowing terms."
    },
    "privacy_policy": {
      "label": "Privacy policy",
      "minor-edit": "Users who accepted the privacy policy don't have to accept it again. Only use this for small corrections, like typos. Without this, all users are asked to accept the changed privacy policy."
    }
  },
  "de": {
    "minor-edit": "Kleine Änderung",
    "borrow_agreement": {
      "label": "Leihbedingungen",
      "minor-edit": "Nutzer, die die Leihbedingungen akzeptiert haben, müssen sie nicht erneut akzeptieren. Nur für kleine Korrekturen wie Tippfehler verwenden. Ohne diese Option müssen alle Nutzer die geänderten Leihbedingungen erneut akzeptieren."
    },
    "privacy_policy": {
      "label": "Datenschutzerklärung",
      "minor-edit": "Nutzer, die die Datenschutzerklärung akzeptiert haben, müssen sie nicht erneut akzeptieren. Nur für kleine Korrekturen wie Tippfehler verwenden. Ohne diese Option werden alle Nutzer gebeten, die geänderte Datenschutzerklärung zu akzeptieren."
    }
  }
}
</i18n>
