export type EndpointValidationStatus =
  | "ok"
  | "validation_error"
  | "missing_route"
  | "auth_error"
  | "provider_error"
  | "network_error"
  | "unexpected_error";

export function classifyEndpointValidationStatus(
  statusCode: number | null
): EndpointValidationStatus {
  if (statusCode === null) {
    return "network_error";
  }

  if (statusCode >= 200 && statusCode < 300) {
    return "ok";
  }

  if (statusCode === 400 || statusCode === 409 || statusCode === 422 || statusCode === 429) {
    return "validation_error";
  }

  if (statusCode === 401 || statusCode === 403) {
    return "auth_error";
  }

  if (statusCode === 404 || statusCode === 405) {
    return "missing_route";
  }

  if (statusCode >= 500) {
    return "provider_error";
  }

  return "unexpected_error";
}

export function extractEndpointValidationMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybeRecord = payload as Record<string, unknown>;
  if (typeof maybeRecord.message === "string" && maybeRecord.message.trim().length > 0) {
    return maybeRecord.message.trim();
  }

  const response = maybeRecord.response;
  if (response && typeof response === "object") {
    const responseRecord = response as Record<string, unknown>;
    if (typeof responseRecord.message === "string" && responseRecord.message.trim().length > 0) {
      return responseRecord.message.trim();
    }
  }

  return fallback;
}
