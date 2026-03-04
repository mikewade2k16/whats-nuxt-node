export interface GroupParticipantResponse {
  jid: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
}

export interface EvolutionContactMatch {
  remoteJid: string;
  phone: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface MessageReactionEntry {
  actorKey: string;
  actorUserId: string | null;
  actorName: string | null;
  actorJid: string | null;
  emoji: string;
  updatedAt: string;
  source: "agent" | "whatsapp";
}
