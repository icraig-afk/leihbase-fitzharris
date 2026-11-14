import { formatPeriod } from "@@/lib/period";

/**
 * Fork-only: placeholders for the retention periods, to write in the privacy
 * policy instead of fixed durations, e.g. "after {RETENTION_INACTIVE} without
 * activity". They show the periods as currently set, see
 * pocketbase/pb_hooks/lib/retention.js.
 */
export const RETENTION_PLACEHOLDERS = {
  RETENTION_INACTIVE: "inactive",
  RETENTION_WARNING: "warning",
  RETENTION_RESERVATIONS: "reservations",
  RETENTION_CLOSED: "closed",
  RETENTION_ADDRESS_CODE: "address_code",
  RETENTION_LOGS: "logs",
  RETENTION_BACKUPS: "backups",
} as const;

type Periods = Partial<
  Record<
    (typeof RETENTION_PLACEHOLDERS)[keyof typeof RETENTION_PLACEHOLDERS],
    number | null
  >
>;

export function useRetentionPlaceholders() {
  const { pb } = usePocketbase();
  const { locale } = useI18n();

  /**
   * Replaces the retention placeholders in the HTML with the current periods
   */
  async function fill(html: string) {
    if (!html || !html.includes("{RETENTION_")) {
      return html;
    }
    let periods: Periods = {};
    try {
      periods = await pb.send<Periods>("/api/retention/periods", {
        requestKey: null,
      });
    } catch (e) {
      console.error("Failed to load the retention periods", e);
    }
    return html.replace(/\{(RETENTION_[A-Z_]+)\}/g, (match, name: string) => {
      const key =
        RETENTION_PLACEHOLDERS[name as keyof typeof RETENTION_PLACEHOLDERS];
      return key ? formatPeriod(periods[key], locale.value) : match;
    });
  }

  return { fill };
}
