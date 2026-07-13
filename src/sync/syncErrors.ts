export function formatQrHandshakeError(error: unknown) {
  const message = error instanceof Error ? error.message : "the handshake failed.";

  if (message.startsWith("this ")) {
    return `QR found, but ${message}`;
  }

  return `QR found, but the handshake failed. ${message}`;
}
