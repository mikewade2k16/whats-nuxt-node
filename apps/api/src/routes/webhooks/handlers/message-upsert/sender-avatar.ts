import { extractPhone, extractProfilePictureFromApiResponse } from "../../contacts.js";

type ProfilePictureClient = {
  fetchProfilePictureUrl(instanceName: string, participantNumber: string): Promise<unknown>;
} | null;

interface ResolveWebhookSenderAvatarParams {
  senderAvatarUrl: string | null;
  isGroup: boolean;
  fromMe: boolean;
  participantJid: string | null;
  participantContact: {
    phone: string;
  } | null;
  evolutionClient: ProfilePictureClient;
  instanceName: string;
}

export async function resolveWebhookSenderAvatar(
  params: ResolveWebhookSenderAvatarParams
) {
  if (params.senderAvatarUrl) {
    return params.senderAvatarUrl;
  }

  if (!params.isGroup || params.fromMe || !params.participantJid) {
    return params.senderAvatarUrl;
  }

  const participantNumber = params.participantContact?.phone || extractPhone(params.participantJid);
  if (!params.evolutionClient || !participantNumber) {
    return null;
  }

  try {
    const profile = await params.evolutionClient.fetchProfilePictureUrl(
      params.instanceName,
      participantNumber
    );
    return extractProfilePictureFromApiResponse(profile);
  } catch {
    return null;
  }
}
