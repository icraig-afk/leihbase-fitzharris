<!--
  Frequently asked questions, managed on /admin/faq. A link to a question, e.g.
  /faq#how-do-deposits-work, opens it.
-->

<template>
  <Container width="md" centered>
    <PageAlert />
    <section class="lb-stack">
      <div class="heading">
        <Heading is="h1" size="xl">{{ t("title") }}</Heading>
        <Button
          v-if="userStore.isAdmin"
          variant="secondary"
          to="/admin/faq"
          data-testid="faq-manage"
        >
          {{ t("manage") }}
        </Button>
      </div>
      <Accordion
        v-if="faqs && faqs.length > 0"
        v-model:open="open"
        class="faqs"
      >
        <div
          v-for="faq in faqs"
          :id="faq.slug"
          :key="faq.id"
          class="faq"
          data-testid="faq"
        >
          <AccordionItem :id="`faq-${faq.slug}`">
            <AccordionTrigger :disabled="false">
              {{ faq.question }}
            </AccordionTrigger>
            <AccordionContent>
              <div
                class="lb-richtext answer"
                data-testid="faq-answer"
                v-html="faq.answer"
              ></div>
            </AccordionContent>
          </AccordionItem>
        </div>
      </Accordion>
      <p v-else data-testid="faq-empty">
        <i>{{ userStore.isAdmin ? t("empty_admin") : t("empty") }}</i>
      </p>
    </section>
  </Container>
</template>

<script setup lang="ts">
import Accordion from "@/components/core/accordion/Accordion.vue";
import AccordionContent from "@/components/core/accordion/AccordionContent.vue";
import AccordionItem from "@/components/core/accordion/AccordionItem.vue";
import AccordionTrigger from "@/components/core/accordion/AccordionTrigger.vue";
import Button from "@/components/core/Button.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import PageAlert from "@/components/page-alert/PageAlert.vue";
import type { Faq } from "~~/models/faq";

const { t } = useI18n({ useScope: "local" });
const { pb } = usePocketbase();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

useHead({ title: t("title") });

// Published questions only, also for admins (who can see drafts)
const { data: faqs } = await useAsyncData("faqs", () =>
  pb.collection("faqs").getFullList<Faq>({
    filter: "published = true",
    sort: "position,created",
  })
);

// Ids of the open questions
const open = ref<string[]>([]);

/**
 * Opens the question in the URL's hash, and scrolls to it. The hash isn't
 * sent to the server, so this runs in the browser.
 */
function openFromHash() {
  const slug = decodeURIComponent(route.hash.replace(/^#/, ""));
  if (!slug || !faqs.value?.some((faq) => faq.slug === slug)) {
    return;
  }
  // Opened here already, e.g. the hash was set by opening it
  if (open.value.includes(`faq-${slug}`)) {
    return;
  }
  open.value = [...open.value, `faq-${slug}`];
  nextTick(() => {
    document.getElementById(slug)?.scrollIntoView({ block: "start" });
  });
}

onMounted(openFromHash);
watch(() => route.hash, openFromHash);

// Keeps the URL pointing at the question opened last, to copy its link
watch(open, (now, before) => {
  const opened = now.find((id) => !before.includes(id));
  if (opened) {
    router.replace({ hash: `#${opened.replace(/^faq-/, "")}` });
  } else if (now.length === 0 && route.hash) {
    router.replace({ hash: "" });
  }
});
</script>

<style scoped>
.heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-3);
}
.faqs {
  max-width: var(--max-text-width, 48rem);
}
.faq {
  scroll-margin-top: 6rem;
}
.answer {
  padding: var(--spacing-3) var(--spacing-2);
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Frequently asked questions",
    "empty": "No questions yet.",
    "empty_admin": "No questions published yet. Add the first ones with \"Manage questions\". Visitors see the FAQ link in the menu once a question is published.",
    "manage": "Manage questions"
  },
  "de": {
    "title": "Häufige Fragen",
    "empty": "Noch keine Fragen.",
    "empty_admin": "Noch keine Fragen veröffentlicht. Füge die ersten über \"Fragen verwalten\" hinzu. Besucher:innen sehen den FAQ-Link im Menü, sobald eine Frage veröffentlicht ist.",
    "manage": "Fragen verwalten"
  }
}
</i18n>
