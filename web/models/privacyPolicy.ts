import type { RecordModel } from "pocketbase";

export type PrivacyPolicy = RecordModel & {
  id: string;
  content: string;
};

export type PrivacyPolicyAcceptance = RecordModel & {
  id: string;
  user: string;
  privacy_policy: string;
};
