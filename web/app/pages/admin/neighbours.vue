<template>
  <Container width="lg" centered>
    <div class="screen lb-stack">
      <header>
        <Heading is="h1" size="xl" data-testid="neighbours-h1">
          {{ t("title") }}
        </Heading>
        <p>{{ t("text") }}</p>
        <Alert v-if="!leihbase.address_verification" variant="info" size="sm">
          {{ t("disabled") }}
        </Alert>
      </header>

      <Alert v-if="error" variant="error">{{ error }}</Alert>

      <!-- Letter just created -->
      <Card v-if="letter" class="lb-stack" data-testid="letter-preview">
        <Heading is="h2" size="lg">
          {{ t("letter_for", { name: letter.name }) }}
        </Heading>
        <p>
          {{ t("code") }}:
          <strong class="code" data-testid="letter-code">{{
            letter.code
          }}</strong>
          · {{ t("expires", { date: formatDate(letter.expires) }) }}
        </p>
        <div class="actions">
          <Button @click="print" data-testid="letter-print">
            {{ t("print") }}
          </Button>
          <Button variant="secondary" @click="letter = null">
            {{ t("close") }}
          </Button>
        </div>
      </Card>

      <div v-if="status === 'pending'" class="loading">
        <LoadingSpinner />
      </div>
      <p v-else-if="!pending || pending.length === 0" data-testid="no-pending">
        {{ t("none") }}
      </p>
      <div v-else class="table">
        <table cellspacing="0">
          <thead>
            <tr>
              <th>{{ t("name") }}</th>
              <th>{{ t("address") }}</th>
              <th>{{ t("signed_up") }}</th>
              <th>{{ t("letter") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in pending"
              :key="item.id"
              :data-testid="`pending-${item.id}`"
            >
              <td>
                <strong>{{ item.name }}</strong
                ><br /><small>{{ item.email }}</small>
              </td>
              <td>
                <template v-if="item.street">
                  {{ item.house_number }} {{ item.street }}
                  <template v-if="item.address_extra"
                    >, {{ item.address_extra }}</template
                  >
                </template>
                <em v-else>{{ t("no_address") }}</em>
              </td>
              <td>{{ formatDate(item.created) }}</td>
              <td>
                <small v-if="item.code_issued" class="issued">
                  {{ t("sent", { date: formatDate(item.code_issued) }) }}
                </small>
                <Button
                  size="sm"
                  :variant="item.code_issued ? 'secondary' : 'primary'"
                  :loading="issuing === item.id"
                  :disabled="!item.street"
                  :data-testid="`issue-${item.id}`"
                  @click="issue(item)"
                >
                  {{ item.code_issued ? t("reissue") : t("create") }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Printed letter, only visible when printing -->
    <article v-if="letter" class="letter" data-testid="letter">
      <p class="sender">{{ leihbase.name }}</p>
      <address>
        {{ letter.name }}<br />
        {{ letter.house_number }} {{ letter.street }}<br />
        <template v-if="letter.address_extra"
          >{{ letter.address_extra }}<br
        /></template>
        <template v-if="letter.town">{{ letter.town }}<br /></template>
        <template v-if="letter.postcode">{{ letter.postcode }}</template>
      </address>
      <p class="date">{{ formatDate(new Date().toISOString()) }}</p>
      <p>{{ t("letter_greeting", { name: letter.name }) }}</p>
      <p>{{ t("letter_text", { name: leihbase.name }) }}</p>
      <p class="letter-code">{{ letter.code }}</p>
      <p>{{ t("letter_instructions") }}</p>
      <p class="url">{{ verifyUrl }}</p>
      <p>{{ t("letter_expiry", { date: formatDate(letter.expires) }) }}</p>
      <p>{{ t("letter_signoff", { name: leihbase.name }) }}</p>
    </article>
  </Container>
</template>

<script lang="ts" setup>
import Alert from "@/components/core/Alert.vue";
import Button from "@/components/core/Button.vue";
import Card from "@/components/core/Card.vue";
import Container from "@/components/core/Container.vue";
import Heading from "@/components/core/Heading.vue";
import LoadingSpinner from "@/components/core/LoadingSpinner.vue";
import { ClientResponseError } from "pocketbase";

type PendingUser = {
  id: string;
  name: string;
  email: string;
  created: string;
  street: string;
  house_number: string;
  address_extra: string;
  postcode: string;
  town: string;
  code_issued: string | null;
};

type Letter = Omit<PendingUser, "id" | "email" | "created" | "code_issued"> & {
  code: string;
  expires: string;
};

const { t, locale } = useI18n({ useScope: "local" });
const { pb, isValid } = usePocketbase();
const { leihbase } = useLeihbase();
const userStore = useUserStore();

useHead({ title: `${t("title")} | Admin` });

if (!isValid.value) {
  await navigateTo({ path: "/login", query: { return: "/admin/neighbours" } });
}
if (!userStore.isAdmin) {
  showError({ statusCode: 404, statusMessage: "Page Not Found" });
}

const {
  data: pending,
  status,
  refresh,
} = await useAsyncData("address-verification-pending", async () => {
  const { items } = await pb.send<{ items: PendingUser[] }>(
    "/api/address-verification/pending",
    {}
  );
  return items;
});

const letter = ref<Letter | null>(null);
const issuing = ref<string | null>(null);
const error = ref("");

const verifyUrl = computed(() =>
  import.meta.client ? `${window.location.origin}/profile/verify-address` : ""
);

function formatDate(value: string) {
  if (!value) return "";
  return new Date(value.replace(" ", "T")).toLocaleDateString(locale.value, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function issue(item: PendingUser) {
  if (
    item.code_issued &&
    !window.confirm(t("reissue_confirm", { name: item.name }))
  ) {
    return;
  }
  error.value = "";
  issuing.value = item.id;
  try {
    letter.value = await pb.send<Letter>(
      `/api/address-verification/${item.id}/issue`,
      { method: "POST" }
    );
    await refresh();
  } catch (e) {
    error.value =
      e instanceof ClientResponseError &&
      e.data?.message === "Already_verified."
        ? t("errors.already_verified")
        : t("errors.general");
  } finally {
    issuing.value = null;
  }
}

function print() {
  window.print();
}
</script>

<style lang="scss" scoped>
header p {
  margin: 0;
}
.actions {
  display: flex;
  gap: var(--fluid-spacing-4);
}
.code {
  font-family: monospace;
  font-size: 1.25em;
  letter-spacing: 0.1em;
}
.table {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  th,
  td {
    text-align: left;
    padding: 0.75rem;
    border-bottom: 1px solid var(--input-border-color);
    vertical-align: top;
  }
}
.issued {
  display: block;
  margin-bottom: 0.5rem;
}
.loading {
  display: flex;
  justify-content: center;
}

.letter {
  display: none;
}
@media print {
  :global(body *) {
    visibility: hidden;
  }
  .letter,
  .letter * {
    visibility: visible;
  }
  .letter {
    display: block;
    position: absolute;
    inset: 0;
    padding: 2cm;
    background: white;
    color: black;
    font-size: 12pt;
    line-height: 1.5;
  }
  .sender {
    text-align: right;
    font-weight: bold;
  }
  address {
    font-style: normal;
    margin: 1.5cm 0 1cm;
  }
  .date {
    text-align: right;
  }
  .letter-code {
    font-family: monospace;
    font-size: 24pt;
    letter-spacing: 0.15em;
    text-align: center;
    margin: 1cm 0;
  }
  .url {
    font-family: monospace;
  }
}
</style>

<i18n lang="json">
{
  "en": {
    "title": "Neighbour verification",
    "text": "New neighbours who still need a code. Create a letter, print it and post it to their address.",
    "disabled": "Neighbour verification is off. Turn on 'address_verification' on the leihbase record in PocketBase to require codes.",
    "none": "Nobody is waiting for a letter.",
    "name": "Name",
    "address": "Address",
    "signed_up": "Signed up",
    "letter": "Letter",
    "no_address": "No address",
    "sent": "Code created {date}",
    "create": "Create letter",
    "reissue": "Re-issue",
    "reissue_confirm": "Create a new code for {name}? The code in the earlier letter will stop working.",
    "letter_for": "Letter for {name}",
    "code": "Code",
    "expires": "valid until {date}",
    "print": "Print letter",
    "close": "Close",
    "letter_greeting": "Dear {name},",
    "letter_text": "Thank you for joining {name}. To confirm that you live at this address, please enter the code below in your profile:",
    "letter_instructions": "Log in, open your profile and choose 'Enter your code', or go to:",
    "letter_expiry": "This code can be used once and is valid until {date}.",
    "letter_signoff": "Happy borrowing, the {name} team",
    "errors": {
      "already_verified": "This neighbour has already confirmed their address.",
      "general": "Something went wrong, please try again."
    }
  },
  "de": {
    "title": "Nachbarschaftsprüfung",
    "text": "Neue Nachbar:innen, die noch einen Code brauchen. Erstelle einen Brief, drucke ihn aus und schicke ihn an ihre Adresse.",
    "disabled": "Die Nachbarschaftsprüfung ist ausgeschaltet. Aktiviere 'address_verification' im leihbase-Eintrag in PocketBase, um Codes zu verlangen.",
    "none": "Niemand wartet auf einen Brief.",
    "name": "Name",
    "address": "Adresse",
    "signed_up": "Registriert",
    "letter": "Brief",
    "no_address": "Keine Adresse",
    "sent": "Code erstellt am {date}",
    "create": "Brief erstellen",
    "reissue": "Neu ausstellen",
    "reissue_confirm": "Neuen Code für {name} erstellen? Der Code aus dem früheren Brief funktioniert dann nicht mehr.",
    "letter_for": "Brief für {name}",
    "code": "Code",
    "expires": "gültig bis {date}",
    "print": "Brief drucken",
    "close": "Schließen",
    "letter_greeting": "Hallo {name},",
    "letter_text": "danke, dass du bei {name} mitmachst. Um zu bestätigen, dass du an dieser Adresse wohnst, gib bitte diesen Code in deinem Profil ein:",
    "letter_instructions": "Logge dich ein, öffne dein Profil und wähle 'Code eingeben', oder gehe zu:",
    "letter_expiry": "Der Code kann einmal verwendet werden und ist gültig bis {date}.",
    "letter_signoff": "Viel Spaß beim Leihen, dein {name}-Team",
    "errors": {
      "already_verified": "Diese Person hat ihre Adresse bereits bestätigt.",
      "general": "Es ist ein Fehler aufgetreten, bitte versuche es erneut."
    }
  }
}
</i18n>
