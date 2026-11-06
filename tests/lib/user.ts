import { pocketbase } from "../services/pocketbase";
import { uniqueId } from "./utils";

export const DEFAULT_PASSWORD = "123456789";

/** Name of the allowed street created in the global setup */
export const TEST_STREET = "Test Street";

/**
 * Returns the id of the test street
 */
export async function getTestStreetId() {
  const pb = await pocketbase();
  const street = await pb
    .collection("streets")
    .getFirstListItem(pb.filter("name = {:name}", { name: TEST_STREET }));
  return street.id;
}

export async function createUser(
  email?: string,
  password?: string,
  role: "user" | "manager" | "admin" = "user",
  locations: string[] = [],
  { addressVerified = true }: { addressVerified?: boolean } = {}
) {
  const pb = await pocketbase();
  const user = await pb.collection("users").create({
    name: "Test User",
    email: email || `test-user-${uniqueId()}@example.com`,
    password: password || DEFAULT_PASSWORD,
    passwordConfirm: password || DEFAULT_PASSWORD,
    role,
    manager_locations: locations,
    terms: true,
    street: await getTestStreetId(),
    house_number: "1",
    address_verified: addressVerified,
  });
  await pb.collection("users").update(user.id, { verified: true });
  return user;
}
