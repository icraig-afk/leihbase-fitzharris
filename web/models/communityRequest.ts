import type { RecordModel } from "pocketbase";

/**
 * Fork-only: a request to the community for an item, see
 * pocketbase/pb_hooks/lib/communityRequests.js
 */
export type CommunityRequest = RecordModel & {
  id: string;
  requester: string;
  requester_first_name: string;
  description: string;
  needed_from: string;
  needed_until: string;
  status: "open" | "closed";
  closed_at: string;
  closed_reason: "" | "requester" | "expired" | "admin" | "account_closed";
};

export type CommunityRequestResponse = RecordModel & {
  id: string;
  request: string;
  responder: string;
  responder_name: string;
  responder_email: string;
  answer: "yes" | "no";
  note: string;
};
