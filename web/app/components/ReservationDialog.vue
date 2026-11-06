<template>
  <Dialog v-model:open="isOpen" inset :title="t('reserve')">
    <div class="dialog">
      <!-- Opening hours -->
      <p
        v-if="location?.opening_hours"
        class="opening-hours"
        data-testid="opening-hours"
      >
        <span>{{ t("opening_hours_of") }} {{ location?.name }}:</span>
        <br />
        <span
          v-html="openingHoursToString(location?.opening_hours, locale)"
        ></span>
      </p>
      <form v-if="product" @submit.prevent="onSubmit">
        <Input
          type="text"
          :label="t('product')"
          v-model="product.name"
          required
          disabled
          readonly
        />
        <DateInput
          :label="t('start')"
          :key="`start-date-${location?.id}`"
          v-model="start"
          :is-date-disallowed="isStartDateDisallowed"
          :show-outside-days="false"
          :description="startDateDescription"
          data-testid="start-input"
          required
        />
        <DateInput
          :label="t('end')"
          :key="`end-date-${location?.id}`"
          :popout-key="`end-date-popout-${start?.getTime()}`"
          v-model="end"
          :is-date-disallowed="isEndDateDisallowed"
          :show-outside-days="false"
          :description="endDateDescription"
          data-testid="end-input"
          required
        />
        <Textarea :label="t('message')" v-model="message" />

        <Alert
          v-if="reservationCreationError"
          variant="error"
          data-testid="reservation-form-error"
          class="alert"
        >
          {{ reservationCreationError }}
        </Alert>

        <Button
          :loading="isSubmittingReservation"
          size="lg"
          type="submit"
          data-testid="reserve-submit"
        >
          {{ t("reserve_now_button") }}
        </Button>
      </form>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { isInOpeningHoursDay } from "@@/lib/openingHours";
import type { OpeningHours } from "@@/lib/openingHours";
import {
  addDays,
  startOfDate as getStartOfDate,
  getStartOfDay,
  isSameDate,
} from "~~/lib/date.js";
import { openingHoursToString } from "~~/lib/openingHours.js";
import type { Reservation } from "~~/models/reservation.js";
import { ClientResponseError } from "pocketbase";
import Alert from "./core/Alert.vue";
import Button from "./core/Button.vue";
import DateInput from "./core/DateInput.vue";
import Dialog from "./core/Dialog.vue";
import Input from "./core/Input.vue";
import Textarea from "./core/Textarea.vue";

const { pb, user } = usePocketbase();
const { t, locale } = useI18n({ useScope: "local" });
const nuxtApp = useNuxtApp();
const userStore = useUserStore();

const { isOpen, product, location } = useReservationDialog();

// Fields
const start = ref<Date>();
const end = ref<Date>();
const message = ref<string>();

const reservationCreationError = ref<string>();
const isSubmittingReservation = ref(false);

const startOfToday = getStartOfDay();
const closedDates = computed(() =>
  (location.value?.opening_hours?.except?.dates || []).map((d) =>
    getStartOfDate(new Date(d))
  )
);
const maxReservationDays = computed(
  () => location.value?.max_reservation_days || 0
);
const reservationStartLimit = computed(
  () => location.value?.reservation_start_limit || 0
);

const startDateDescription = computed(() => {
  if (reservationStartLimit.value <= 0) {
    return undefined;
  }
  return `${location.value?.name} ${t("allows_reserving_days_in_future", { days: reservationStartLimit.value })}`;
});

const endDateDescription = computed(() => {
  if (maxReservationDays.value <= 0) {
    return undefined;
  }
  return `${location.value?.name} ${t("allows_reservations_up_to_days", { days: maxReservationDays.value })}`;
});

watch(isOpen, (newValue) => {
  if (!newValue) {
    start.value = undefined;
    end.value = undefined;
  }
});

function isPastDate(startOfDate: Date, today: Date) {
  return startOfDate < today;
}

function isClosedDate(startOfDate: Date, closedDatesList: Date[]) {
  return closedDatesList.some((date) => isSameDate(date, startOfDate));
}

function isBeyondStartLimit(startOfDate: Date, limit: number, today: Date) {
  if (limit <= 0) return false;
  const limitDate = addDays(today, limit);
  return startOfDate > limitDate;
}

function isBeyondMaxDuration(
  date: Date,
  startDate: Date | undefined,
  limit: number
) {
  if (limit <= 0 || !startDate) return false;
  const maxEndDate = addDays(getStartOfDate(startDate), limit);
  return date > maxEndDate;
}

function isOpenDay(date: Date, openingHours: OpeningHours | undefined) {
  return openingHours ? isInOpeningHoursDay(openingHours, date) : true;
}

function isStartDateDisallowed(date: Date): boolean {
  const startOfDate = getStartOfDate(date);
  const isOpen = isOpenDay(date, location.value?.opening_hours);
  const isPast = isPastDate(startOfDate, startOfToday);
  const isClosed = isClosedDate(startOfDate, closedDates.value);
  const isBeyondLimit = isBeyondStartLimit(
    startOfDate,
    reservationStartLimit.value,
    startOfToday
  );
  return !isOpen || isPast || isClosed || isBeyondLimit;
}

function isEndDateDisallowed(date: Date): boolean {
  const startOfDate = getStartOfDate(date);
  const isBeforeStart =
    start.value && startOfDate <= getStartOfDate(start.value);
  const isOpen = isOpenDay(date, location.value?.opening_hours);
  const isPast = isPastDate(startOfDate, startOfToday);
  const isClosed = isClosedDate(startOfDate, closedDates.value);
  const isBeyondMax = isBeyondMaxDuration(
    startOfDate,
    start.value,
    maxReservationDays.value
  );
  return !isOpen || isPast || isBeforeStart || isClosed || isBeyondMax;
}

async function onSubmit() {
  if (!location.value || !product.value) {
    console.error("Can't create reservation, no location or product defined");
    return;
  }
  if (!user.value?.id) {
    console.error("Can't create reservation, no user id defined");
    return;
  }

  reservationCreationError.value = undefined;
  isSubmittingReservation.value = true;
  let reservation;
  try {
    reservation = (await pb.collection("reservations").create({
      user: user.value?.id,
      product: product.value.id,
      start: start.value,
      end: end.value,
      message: message.value,
      send_confirmation: true,
    })) as Reservation;
  } catch (e) {
    isSubmittingReservation.value = false;
    if (e instanceof ClientResponseError && e.status === 400 && e.message) {
      switch (e.message) {
        case "User_not_verified.":
          reservationCreationError.value = t("errors.user_not_verified");
          break;
        case "User_address_not_verified.":
          reservationCreationError.value = t(
            "errors.user_address_not_verified"
          );
          break;
        case "Product_has_open_reservation.":
          reservationCreationError.value = t(
            "errors.product_has_open_reservation",
            {
              email: location.value.email,
            }
          );
          break;
        case "User_has_open_reservation.":
          reservationCreationError.value = t(
            "errors.user_has_open_reservation",
            {
              email: location.value.email,
            }
          );
          break;
        case "Date_range_too_long.":
          reservationCreationError.value = t("errors.date_range_too_long", {
            days: location.value.max_reservation_days || 14,
            email: location.value.email,
          });
          break;
        case "Overlapping_reservation.":
          reservationCreationError.value = t("errors.overlapping_reservation");
          break;
        case "Start_before_today.":
          reservationCreationError.value = t("errors.start_before_today");
          break;
        case "End_before_today.":
          reservationCreationError.value = t("errors.end_before_today");
          break;
        case "Start_and_end_equal.":
          reservationCreationError.value = t("errors.start_and_end_equal");
          break;
        case "End_before_start.":
          reservationCreationError.value = t("errors.end_before_start");
          break;
        case "Reservation_system_disabled.":
          reservationCreationError.value = t(
            "errors.reservation_system_disabled"
          );
          break;
        case "Reservation_start_too_far_in_future.":
          reservationCreationError.value = t(
            "errors.reservation_start_too_far_in_future",
            {
              days: location.value.reservation_start_limit,
              email: location.value.email,
            }
          );
          break;
      }
      if (!reservationCreationError.value) {
        reservationCreationError.value = t("errors.general");
      }
    }
  }

  if (!reservation) {
    return;
  }

  await userStore.fetchUserReservations();
  nuxtApp.callHook("app:user:reservation:create", reservation);
  isSubmittingReservation.value = false;
  isOpen.value = false;
}
</script>

<style scoped>
.dialog form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.dialog .alert {
  margin: 0;
}
.opening-hours {
  padding: 1rem;
  background-color: #ecf4fe;
  border-radius: var(--border-radius);
  margin-bottom: 1rem;
}
</style>

<i18n lang="json">
{
  "en": {
    "reserve": "Reserve",
    "opening_hours_of": "Opening hours of",
    "product": "Product",
    "start": "Start",
    "end": "End",
    "message": "Message",
    "reserve_now_button": "Reserve now",
    "allows_reserving_days_in_future": "allows reserving {days} days in the future.",
    "allows_reservations_up_to_days": "allows reservations up to {days} days.",
    "errors": {
      "user_not_verified": "Confirm your e-mail address before placing a reservation.",
      "user_address_not_verified": "Confirm your address with the code from your letter before placing a reservation.",
      "product_has_open_reservation": "This product is currently not available.",
      "user_has_open_reservation": "You have an open reservation for this product. Reach out on {email} to extend or change your reservation.",
      "date_range_too_long": "Products can't be reserved for longer than {days} days. Reach out on {email} to discuss a longer period.",
      "overlapping_reservation": "The product is already reserved for this period.",
      "start_before_today": "The start of the reservation is before today.",
      "end_before_today": "The end of the reservation is before today.",
      "start_and_end_equal": "The start and end of the reservation can't be on the same day.",
      "end_before_start": "The end can't be befor the start of the reservation.",
      "reservation_system_disabled": "Reservations are not allowed for this location.",
      "reservation_start_too_far_in_future": "Reservations can't start more than {days} days in the future. Reach out on {email} to discuss.",
      "general": "Something went wrong while creating the reservation, please try again."
    }
  },
  "de": {
    "reserve": "Reservieren",
    "opening_hours_of": "Öffnungszeiten von",
    "product": "Gegenstand",
    "start": "Start",
    "end": "Ende",
    "message": "Nachricht",
    "reserve_now_button": "Jetzt reservieren",
    "allows_reserving_days_in_future": "erlaubt Reservierungen bis zu {days} Tage im Voraus.",
    "allows_reservations_up_to_days": "erlaubt Reservierungen von bis zu {days} Tagen.",
    "errors": {
      "user_not_verified": "Bestätige deine E-Mail-Adresse, bevor du reservierst.",
      "user_address_not_verified": "Bestätige deine Adresse mit dem Code aus deinem Brief, bevor du reservierst.",
      "product_has_open_reservation": "Diesen Gegenstand ist derzeit nicht verfügbar.",
      "user_has_open_reservation": "Du hast diesen Gegenstand bereits reserviert. Wenn du deine Reservierung verlängern oder ändern möchtest, schreibe eine Mail an {email}.",
      "date_range_too_long": "Produkte können nicht länger als {days} Tage reserviert werden. Kontaktiere uns unter {email}, um einen längeren Zeitraum zu besprechen.",
      "overlapping_reservation": "Das Produkt ist für diesen Termin bereits reserviert.",
      "start_before_today": "Der Beginn der Reservierung liegt vor dem heutigen Tag.",
      "end_before_today": "Das Enddatum der Reservierung liegt vor dem heutigen Tag.",
      "start_and_end_equal": "Beginn und Ende der Reservierung dürfen nicht am selben Tag liegen.",
      "end_before_start": "Ende kann nicht vor Beginn der Reservierung liegen.",
      "reservation_system_disabled": "Reservierungen sind für diesen Standort nicht erlaubt.",
      "reservation_start_too_far_in_future": "Reservierungen können nicht mehr als {days} Tage im Voraus beginnen. Kontaktiere uns unter {email}, um dies zu besprechen.",
      "general": "Beim Erstellen deiner Reservierung ist ein Fehler aufgetreten, bitte versuche es erneut."
    }
  }
}
</i18n>
