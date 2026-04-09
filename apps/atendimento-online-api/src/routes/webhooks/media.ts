import { MessageType } from "@prisma/client";

export const MEDIA_MESSAGE_TYPES: MessageType[] = [
  MessageType.IMAGE,
  MessageType.AUDIO,
  MessageType.VIDEO,
  MessageType.DOCUMENT
];

export * from "./media-url.js";
export * from "./media-link-preview.js";
export * from "./media-source.js";
export * from "./media-file.js";
