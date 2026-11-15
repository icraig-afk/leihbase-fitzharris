<!--
  Frequently asked questions, for admins: add, edit, publish, reorder and
  delete. Shown to everyone on /faq once published.
-->

<template>
  <Container width="lg" centered>
    <PageAlert class="banner" />

    <div class="header lb-stack">
      <Link to="/admin">{{ t("back") }}</Link>
      <Heading is="h1" size="xl">{{ t("title") }}</Heading>
      <p class="intro">
        {{ t("intro") }}
        <NuxtLink to="/faq" target="_blank" class="link">{{
          t("view")
        }}</NuxtLink>
      </p>
      <!-- Fork-only: placeholders in answers -->
      <p class="placeholders" data-testid="faq-placeholders">
        {{ t("placeholders") }}
        <template
          v-for="(placeholder, index) in POLICY_PLACEHOLDERS"
          :key="placeholder"
        >
          <code>{{ placeholder }}</code
          >{{ index < POLICY_PLACEHOLDERS.length - 1 ? ", " : "." }}
        </template>
      </p>
    </div>

    <Alert v-if="error" variant="error">{{ t("error") }}</Alert>

    <ol v-if="faqs && faqs.length > 0" class="faqs">
      <li
        v-for="(faq, index) in faqs"
        :key="faq.id"
        class="faq"
        data-testid="admin-faq"
      >
        <!-- Editing -->
        <form
          v-if="editing === faq.id"
          class="lb-stack"
          @submit.prevent="saveEdit(faq)"
        >
          <Input
            :id="`faq-question-${faq.id}`"
            v-model="editQuestion"
            :label="t('question')"
            required
            data-testid="admin-faq-question"
          />
          <div data-testid="admin-faq-answer">
            <RichTextarea v-model="editAnswer" :label="t('answer')" />
          </div>
          <div class="actions">
            <Button
              type="submit"
              size="sm"
              :loading="saving"
              data-testid="admin-faq-save"
            >
              {{ t("save") }}
            </Button>
            <Button variant="secondary" size="sm" @click="editing = undefined">
              {{ t("cancel") }}
            </Button>
          </div>
        </form>

        <!-- Showing -->
        <template v-else>
          <div class="row">
            <strong class="question">{{ faq.question }}</strong>
            <Switch
              :id="`faq-published-${faq.id}`"
              :model-value="faq.published"
              :label="t('published')"
              data-testid="admin-faq-published"
              @update:model-value="(value: boolean) => setPublished(faq, value)"
            />
          </div>
          <div class="actions">
            <Button
              variant="secondary"
              size="sm"
              data-testid="admin-faq-edit"
              @click="startEdit(faq)"
            >
              {{ t("edit") }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              :disabled="index === 0"
              data-testid="admin-faq-up"
              @click="move(index, -1)"
            >
              {{ t("up") }}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              :disabled="index === faqs.length - 1"
              data-testid="admin-faq-down"
              @click="move(index, 1)"
            >
              {{ t("down") }}
            </Button>
            <Button
              v-if="confirmDelete !== faq.id"
              variant="secondary"
              size="sm"
              data-testid="admin-faq-delete"
              @click="confirmDelete = faq.id"
            >
              {{ t("delete") }}
            </Button>
            <template v-else>
              <Button
                size="sm"
                data-testid="admin-faq-delete-confirm"
                @click="remove(faq)"
              >
                {{ t("delete_confirm") }}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                @click="confirmDelete = undefined"
              >
                {{ t("cancel") }}
              </Button>
            </template>
          </div>
        </template>
      </li>
    </ol>
    <p v-else>
      <i>{{ t("empty") }}</i>
    </p>

    <!-- New question -->
    <form class="new lb-stack" @submit.prevent="add">
      <Heading is="h2" size="lg">{{ t("new") }}</Heading>
      <Input
        id="faq-new-question"
        v-model="newQuestion"
        :label="t('question')"
        required
        data-testid="admin-faq-new-question"
      />
      <div data-testid="admin-faq-new-answer">
        <RichTextarea v-model="newAnswer" :label="t('answer')" />
      </div>
      <Switch
        id="faq-new-published"
        v-model="newPublished"
        :label="t('published')"
        :description="t('published_description')"
      />
      <div>
        <Button type="submit" :loading="saving" data-testid="admin-faq-add">
          {{ t("add") }}
        </Button>
      </div>
    </form>
  </Container>
</template>

<script setup lang="ts">
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import Input from "@/components/core/Input.vue";
import Link from "@/components/core/Link.vue";
import RichTextarea from "@/components/core/RichTextarea.vue";
import Switch from "@/components/core/Switch.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";
import { POLICY_PLACEHOLDERS } from "@/composables/useRetentionPlaceholders";
import type { Faq } from "~~/models/faq";

const { t } = useI18n({ useScope: "local" });
const { pb, isValid } = usePocketbase();
const userStore = useUserStore();

if (!isValid.value) {
  await navigateTo({ path: "/login", query: { return: "/admin/faq" } });
}
if (!userStore.isAdmin) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found" });
}

useHead({ title: t("title") });

const { data: faqs, refresh } = await useAsyncData("admin_faqs", () =>
  pb.collection("faqs").getFullList<Faq>({ sort: "position,created" })
);

const error = ref(false);
const saving = ref(false);
const editing = ref<string>();
const editQuestion = ref("");
const editAnswer = ref<string>();
const confirmDelete = ref<string>();
const newQuestion = ref("");
const newAnswer = ref<string>();
const newPublished = ref(true);

/**
 * Runs a change, shows an error when it fails, and reloads the questions
 */
async function change(fn: () => Promise<unknown>) {
  error.value = false;
  saving.value = true;
  try {
    await fn();
  } catch (e) {
    console.error("Error saving the FAQ", e);
    error.value = true;
  } finally {
    saving.value = false;
    await refresh();
  }
}

function startEdit(faq: Faq) {
  editing.value = faq.id;
  editQuestion.value = faq.question;
  editAnswer.value = faq.answer;
}

function saveEdit(faq: Faq) {
  return change(async () => {
    await pb.collection("faqs").update(faq.id, {
      question: editQuestion.value,
      answer: editAnswer.value || "",
    });
    editing.value = undefined;
  });
}

function setPublished(faq: Faq, published: boolean) {
  return change(() => pb.collection("faqs").update(faq.id, { published }));
}

/** Moves a question up (-1) or down (1), renumbering them all */
function move(index: number, direction: -1 | 1) {
  const order = [...(faqs.value ?? [])];
  const [moved] = order.splice(index, 1);
  if (!moved) return;
  order.splice(index + direction, 0, moved);
  return change(async () => {
    for (const [i, faq] of order.entries()) {
      if (faq.position !== i + 1) {
        await pb.collection("faqs").update(faq.id, { position: i + 1 });
      }
    }
  });
}

function remove(faq: Faq) {
  return change(async () => {
    await pb.collection("faqs").delete(faq.id);
    confirmDelete.value = undefined;
  });
}

function add() {
  return change(async () => {
    await pb.collection("faqs").create({
      question: newQuestion.value,
      answer: newAnswer.value || "",
      published: newPublished.value,
    });
    newQuestion.value = "";
    newAnswer.value = "";
    newPublished.value = true;
  });
}
</script>

<style scoped>
.header {
  margin-bottom: var(--fluid-spacing-6);
}
.intro {
  margin: 0;
  max-width: 40rem;
}
.placeholders {
  margin: 0;
  max-width: 40rem;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
}
/* Like the Link component, which doesn't support opening in a new tab */
.link {
  color: var(--text-color);
  text-decoration: underline;
}
.faqs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  max-width: 48rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.faq {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  border: 1px solid var(--input-border-color);
  border-radius: var(--border-radius);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-4);
}
.question {
  overflow-wrap: anywhere;
}
.row :deep(.root) {
  width: auto;
  flex-shrink: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}
.new {
  max-width: 48rem;
  margin-top: var(--fluid-spacing-8);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Frequently asked questions",
    "back": "Back to the admin",
    "intro": "Answers to common questions, shown to everyone on the FAQ page once published.",
    "view": "View the FAQ page",
    "placeholders": "Answers can use these placeholders, which show the name of the library and the data retention periods as currently set:",
    "question": "Question",
    "answer": "Answer",
    "published": "Published",
    "published_description": "Show the question on the FAQ page straight away.",
    "edit": "Edit",
    "up": "Move up",
    "down": "Move down",
    "delete": "Delete",
    "delete_confirm": "Yes, delete it",
    "save": "Save",
    "cancel": "Cancel",
    "new": "Add a question",
    "add": "Add question",
    "empty": "No questions yet.",
    "error": "The change couldn't be saved, please try again."
  },
  "de": {
    "title": "Häufige Fragen",
    "back": "Zurück zur Verwaltung",
    "intro": "Antworten auf häufige Fragen, die nach dem Veröffentlichen allen auf der FAQ-Seite angezeigt werden.",
    "view": "FAQ-Seite ansehen",
    "placeholders": "Antworten können diese Platzhalter verwenden, die den Namen der Bibliothek und die aktuell eingestellten Aufbewahrungsfristen anzeigen:",
    "question": "Frage",
    "answer": "Antwort",
    "published": "Veröffentlicht",
    "published_description": "Die Frage sofort auf der FAQ-Seite anzeigen.",
    "edit": "Bearbeiten",
    "up": "Nach oben",
    "down": "Nach unten",
    "delete": "Löschen",
    "delete_confirm": "Ja, löschen",
    "save": "Speichern",
    "cancel": "Abbrechen",
    "new": "Frage hinzufügen",
    "add": "Frage hinzufügen",
    "empty": "Noch keine Fragen.",
    "error": "Die Änderung konnte nicht gespeichert werden, bitte versuche es erneut."
  }
}
</i18n>
