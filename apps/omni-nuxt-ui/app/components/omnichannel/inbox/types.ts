import type { Message } from "~/types";

export interface InboxSelectOption {
  label: string;
  value: string;
}

export type InboxRenderItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; message: Message; dateKey: string; dateLabel: string };
