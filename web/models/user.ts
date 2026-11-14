import type { RecordModel } from "pocketbase";

export type User = RecordModel & {
  id: string;
  name: string;
  role: "user" | "manager" | "admin";
  manager_locations: string[];
  street?: string;
  house_number?: string;
  address_extra?: string;
  /** Whether the address was verified with a code sent by post */
  address_verified?: boolean;
  /** Fork-only: no emails about community requests */
  community_requests_opt_out?: boolean;
};
