import type { Location } from "~~/models/location";
import type { Product } from "~~/models/product";

export const useReservationDialog = function () {
  const isOpen = useState<boolean>(() => false);
  const product = useState<Product | null>(() => null);
  const location = useState<Location | null>(() => null);

  const { pb, user } = usePocketbase();
  const userStore = useUserStore();
  const { open: openVerificationDialog } = useVerificationDialog();
  const { open: openAddressVerificationDialog } =
    useAddressVerificationDialog();
  const { leihbase } = useLeihbase();

  async function open(_location: Location, _product: Product) {
    // Check authentication status
    if (!pb.authStore.isValid) {
      userStore.setAuthenticationIntent(
        "reservation",
        `/l/${_location.slug}/p/${_product.id}`
      );
      navigateTo("/signup");
      return;
    }

    // Checkout verification status
    if (!user.value?.verified) {
      await pb.collection("users").authRefresh();
    }
    if (!user.value?.verified) {
      openVerificationDialog();
      return;
    }

    // Check address verification (code sent by post), managers and admins
    // can always reserve
    if (
      leihbase.address_verification &&
      user.value?.role === "user" &&
      !user.value?.address_verified
    ) {
      await pb.collection("users").authRefresh();
      if (!user.value?.address_verified) {
        openAddressVerificationDialog();
        return;
      }
    }

    // Open reservation dialog
    isOpen.value = true;
    product.value = _product;
    location.value = _location;
  }

  return {
    open,
    isOpen,
    product,
    location,
  };
};

export const useAddressVerificationDialog = function () {
  const isOpen = useState<boolean | undefined>(
    "address-verification-dialog",
    () => false
  );

  function open() {
    isOpen.value = true;
  }

  return {
    open,
    isOpen,
  };
};

export const useVerificationDialog = function () {
  const isOpen = useState<boolean | undefined>(() => false);

  function open() {
    isOpen.value = true;
  }

  return {
    open,
    isOpen,
  };
};
