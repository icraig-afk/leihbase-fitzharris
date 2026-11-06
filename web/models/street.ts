import type { RecordModel } from "pocketbase";

export type Street = RecordModel & {
  id: string;
  name: string;
  postcode: string;
  town: string;
  active: boolean;
};
