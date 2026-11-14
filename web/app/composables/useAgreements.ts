import type { BorrowAgreement } from "@@/models/borrowAgreement";
import type { PrivacyPolicy } from "@@/models/privacyPolicy";

/**
 * A current instance-wide agreement the user hasn't accepted yet
 */
export type OutstandingAgreement =
  | { kind: "privacy_policy"; agreement: PrivacyPolicy }
  | { kind: "borrow_agreement"; agreement: BorrowAgreement };

const ACCEPTANCES = {
  privacy_policy: "privacy_policy_acceptances",
  borrow_agreement: "borrow_agreement_acceptances",
} as const;

const AGREEMENTS = {
  privacy_policy: "privacy_policies",
  borrow_agreement: "borrow_agreements",
} as const;

/**
 * The instance-wide agreements users accept on sign-up, and again after they
 * changed: the privacy policy, and the borrowing terms of all locations
 */
export function useAgreements() {
  const { pb } = usePocketbase();
  // The user who accepted all current agreements during this visit, so they're
  // checked once per visit instead of on every page
  const checkedUser = useState<string | null>(
    "agreements_checked_user",
    () => null
  );

  /**
   * The ids of the current agreements, read fresh from the server
   */
  async function getCurrent() {
    const [leihbase] = await pb.collection("leihbase").getFullList({
      fields: "privacy_policy,borrow_agreement",
      requestKey: null,
    });
    return {
      privacy_policy: (leihbase?.privacy_policy as string) || "",
      borrow_agreement: (leihbase?.borrow_agreement as string) || "",
    };
  }

  async function hasAccepted(
    kind: OutstandingAgreement["kind"],
    user: string,
    agreement: string
  ) {
    const acceptances = await pb.collection(ACCEPTANCES[kind]).getList(1, 1, {
      filter: pb.filter(`user = {:user} && ${kind} = {:agreement}`, {
        user,
        agreement,
      }),
      skipTotal: true,
      requestKey: null,
    });
    return acceptances.items.length > 0;
  }

  /**
   * The current agreements the user hasn't accepted
   */
  async function getOutstanding(user: string) {
    const current = await getCurrent();
    const outstanding: OutstandingAgreement[] = [];
    for (const kind of ["privacy_policy", "borrow_agreement"] as const) {
      const id = current[kind];
      if (id && !(await hasAccepted(kind, user, id))) {
        const agreement = await pb
          .collection(AGREEMENTS[kind])
          .getOne(id, { requestKey: null });
        outstanding.push({ kind, agreement } as OutstandingAgreement);
      }
    }
    if (outstanding.length === 0) {
      checkedUser.value = user;
    }
    return outstanding;
  }

  /**
   * If the user should review and accept changed agreements. Checked once per
   * visit, unless `force` is set.
   */
  async function needsReview(user: string, force = false) {
    if (!force && checkedUser.value === user) {
      return false;
    }
    return (await getOutstanding(user)).length > 0;
  }

  /**
   * Stores that the user accepted the agreement
   */
  async function accept(user: string, outstanding: OutstandingAgreement) {
    await pb.collection(ACCEPTANCES[outstanding.kind]).create({
      user,
      [outstanding.kind]: outstanding.agreement.id,
    });
  }

  return { getOutstanding, needsReview, accept };
}
