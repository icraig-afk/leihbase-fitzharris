import type { RecordModel } from "pocketbase";

export type Faq = RecordModel & {
  id: string;
  question: string;
  /** Rich text */
  answer: string;
  /** For links to the question, e.g. /faq#how-do-deposits-work */
  slug: string;
  position: number;
  published: boolean;
};
