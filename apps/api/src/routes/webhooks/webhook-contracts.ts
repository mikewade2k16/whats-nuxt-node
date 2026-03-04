export interface IncomingWebhookPayload {
  [key: string]: unknown;
}

export interface EvolutionContactMatch {
  remoteJid: string;
  phone: string;
  name: string | null;
  avatarUrl: string | null;
}
