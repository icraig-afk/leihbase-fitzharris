/**
 * Pages there's no point returning to after logging in or signing up
 */
const NO_RETURN_PATHS = [
  "/login",
  "/signup",
  "/reset-password",
  "/confirm-password-reset",
  "/confirm-verification",
];

/**
 * The page to return to after logging in or signing up, or `undefined` when
 * there's none. Only paths on this website: a crafted link can't send users
 * to another site after logging in.
 */
export function getReturnPath(value: unknown): string | undefined {
  const path = Array.isArray(value) ? value[0] : value;
  if (typeof path !== "string" || !path.startsWith("/")) {
    return undefined;
  }
  // "//example.com" and "/\example.com" would go to another site
  if (path.startsWith("//") || path.startsWith("/\\")) {
    return undefined;
  }
  const pathname = path.split(/[?#]/)[0] ?? "";
  if (
    pathname === "/" ||
    NO_RETURN_PATHS.some((noReturn) => pathname.startsWith(noReturn))
  ) {
    return undefined;
  }
  return path;
}
