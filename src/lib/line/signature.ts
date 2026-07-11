import { createHmac } from "crypto";

export function verifyLineSignature(
  body: string,
  signature: string | null,
  channelSecret: string
): boolean {
  if (!signature) return false;
  const digest = createHmac("sha256", channelSecret).update(body).digest("base64");
  return digest === signature;
}
