/**
 * Fork-only: if community requests are on, and if the logged in user can take
 * part (a verified email address and address). See
 * pocketbase/pb_hooks/lib/communityRequests.js.
 */
export function useCommunityRequests() {
  const { leihbase } = storeToRefs(useLeihbase());
  const { isValid, user } = usePocketbase();

  const isEnabled = computed(
    () =>
      !!leihbase.value?.community_requests &&
      !!leihbase.value?.address_verification
  );
  const isEmailVerified = computed(() => !!user.value?.verified);
  const isAddressVerified = computed(() => !!user.value?.address_verified);
  const canTakePart = computed(
    () =>
      isEnabled.value &&
      isValid.value &&
      isEmailVerified.value &&
      isAddressVerified.value
  );

  return { isEnabled, isEmailVerified, isAddressVerified, canTakePart };
}
