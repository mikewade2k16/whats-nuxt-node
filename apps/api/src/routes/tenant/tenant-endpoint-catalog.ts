import { env } from "../../config.js";

export interface EvolutionEndpointProbe {
  key: "text" | "media" | "audio" | "contact" | "sticker" | "reaction";
  label: string;
  pathTemplate: string;
  payload: Record<string, unknown>;
}

export function buildEndpointProbes() {
  return [
    {
      key: "text",
      label: "sendText",
      pathTemplate: env.EVOLUTION_SEND_PATH,
      payload: {
        number: "0000000000",
        text: "[probe] endpoint validation",
        textMessage: {
          text: "[probe] endpoint validation"
        }
      }
    },
    {
      key: "media",
      label: "sendMedia",
      pathTemplate: env.EVOLUTION_SEND_MEDIA_PATH,
      payload: {
        number: "0000000000",
        mediatype: "document",
        media: "ZHVtbXk=",
        fileName: "probe.txt",
        caption: "[probe]"
      }
    },
    {
      key: "audio",
      label: "sendWhatsAppAudio",
      pathTemplate: env.EVOLUTION_SEND_AUDIO_PATH,
      payload: {
        number: "0000000000",
        audio: "ZHVtbXk="
      }
    },
    {
      key: "contact",
      label: "sendContact",
      pathTemplate: env.EVOLUTION_SEND_CONTACT_PATH,
      payload: {
        number: "0000000000",
        fullName: "Endpoint Probe",
        phone: "0000000000",
        contacts: [
          {
            fullName: "Endpoint Probe",
            phoneNumber: "0000000000"
          }
        ]
      }
    },
    {
      key: "sticker",
      label: "sendSticker",
      pathTemplate: env.EVOLUTION_SEND_STICKER_PATH,
      payload: {
        number: "0000000000",
        sticker: "ZHVtbXk=",
        fileName: "probe.webp"
      }
    },
    {
      key: "reaction",
      label: "sendReaction",
      pathTemplate: env.EVOLUTION_SEND_REACTION_PATH,
      payload: {
        key: {
          remoteJid: "0000000000@s.whatsapp.net",
          fromMe: false,
          id: "probe-message-id"
        },
        reaction: "👍"
      }
    }
  ] as const satisfies readonly EvolutionEndpointProbe[];
}
