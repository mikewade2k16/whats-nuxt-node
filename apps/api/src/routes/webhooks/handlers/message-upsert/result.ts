export function buildMessageUpsertWebhookResult(params: {
  created: boolean;
  messageId: string;
  conversationId: string;
}) {
  return {
    statusCode: 200,
    body: {
      status: "ok",
      created: params.created,
      deduplicated: !params.created,
      messageId: params.messageId,
      conversationId: params.conversationId
    }
  };
}
