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

/** Fork-only: the name of the library, from the leihbase record */
export const LIBRARY_NAME_PLACEHOLDER = "LIBRARY_NAME";

/** All placeholders, as written in the text */
export const POLICY_PLACEHOLDERS = [
  LIBRARY_NAME_PLACEHOLDER,
  ...Object.keys(RETENTION_PLACEHOLDERS),
].map((name) => `{${name}}`);

type Periods = Partial<
  Record<
    (typeof RETENTION_PLACEHOLDERS)[keyof typeof RETENTION_PLACEHOLDERS],
    number | null
  >
>;

/** Escapes text to insert it in HTML */
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function useRetentionPlaceholders() {
  const { pb } = usePocketbase();
  const { locale } = useI18n();
  const { leihbase } = storeToRefs(useLeihbase());

  /**
   * Replaces the placeholders in the HTML: the name of the library, and the
   * retention periods as currently set
   */
  async function fill(html: string) {
    if (!html || !/\{(RETENTION_[A-Z_]+|LIBRARY_NAME)\}/.test(html)) {
      return html;
    }
    let periods: Periods = {};
    if (html.includes("{RETENTION_")) {
      try {
        periods = await pb.send<Periods>("/api/retention/periods", {
          requestKey: null,
        });
      } catch (e) {
        console.error("Failed to load the retention periods", e);
      }
    }
    const libraryName = escapeHtml((leihbase.value?.name || "").trim());
    return html.replace(
      /\{(RETENTION_[A-Z_]+|LIBRARY_NAME)\}/g,
      (match, name: string) => {
        if (name === LIBRARY_NAME_PLACEHOLDER) {
          return libraryName;
        }
        const key =
          RETENTION_PLACEHOLDERS[name as keyof typeof RETENTION_PLACEHOLDERS];
        return key ? formatPeriod(periods[key], locale.value) : match;
      }
    );
  }

  return { fill };
}
