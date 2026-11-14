import type { RecordModel } from "pocketbase";

export type Leihbase = RecordModel & {
  id: string;
  name: string;
  description?: string;
  contact_link?: string;
  privacy_policy_link?: string;
  footer_links?: {
    text: string;
    link: string;
  }[];
  style?: string;
  /**
   * Only allow sign-ups from the listed streets, and require a code sent by
   * post before reserving
   */
  address_verification?: boolean;
  /** ISO 4217 code of the currency of deposits, "EUR" when empty */
  currency?: string;
  /**
   * Instance-wide borrow agreement, for locations without a borrow agreement
   * of their own
   */
  borrow_agreement?: string;
  /** Current privacy policy, replaces `privacy_policy_link` when set */
  privacy_policy?: string;
};
