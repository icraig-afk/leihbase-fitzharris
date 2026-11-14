/**
 * Asks logged in users to review and accept the privacy policy and the
 * borrowing terms of all locations, after they changed (or when they were
 * introduced after the user signed up)
 */

// Pages users can always open, also without accepting. Staff can work in the
// admin section, as reserving doesn't require them to accept either.
const EXEMPT_PATHS = [
  "/admin",
  "/profile/agreements",
  // Fork-only: closing the account doesn't need accepting first
  "/profile/close-account",
  "/privacy",
  "/borrowing-terms",
  "/login",
  "/signup",
  "/reset-password",
  "/confirm-",
];

export default defineNuxtRouteMiddleware(async (to) => {
  if (EXEMPT_PATHS.some((path) => to.path.startsWith(path))) {
    return;
  }
  const { pb, isValid } = usePocketbase();
  const user = pb.authStore.record;
  if (!isValid.value || !user || user.collectionName !== "users") {
    return;
  }

  try {
    if (await useAgreements().needsReview(user.id)) {
      return navigateTo({
        path: "/profile/agreements",
        query: { return: to.fullPath },
      });
    }
  } catch (e) {
    // Never block the website when the check fails
    console.error("Failed to check the agreements of the user", e);
  }
});
