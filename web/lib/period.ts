/**
 * Fork-only: a number of days in words, for the retention periods in the
 * privacy policy: "2 years" for whole years, else "30 days". `null` or 0 is
 * "not set".
 */
export function formatPeriod(days: number | null | undefined, locale: string) {
  const de = locale === "de";
  if (!days || days <= 0) {
    return de ? "nicht festgelegt" : "not set";
  }
  if (days % 365 === 0) {
    const years = days / 365;
    return de
      ? `${years} ${years === 1 ? "Jahr" : "Jahre"}`
      : `${years} ${years === 1 ? "year" : "years"}`;
  }
  return de
    ? `${days} ${days === 1 ? "Tag" : "Tage"}`
    : `${days} ${days === 1 ? "day" : "days"}`;
}
