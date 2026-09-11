/**
 * Version-4 UUID string from crypto.getRandomValues.
 * crypto.randomUUID is not used: it is missing on plain http origins.
 */

export function newClientRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    let value = bytes[i] ?? 0;
    if (i === 6) {
      value = (value & 0x0f) | 0x40;
    } else if (i === 8) {
      value = (value & 0x3f) | 0x80;
    }
    out[i] = value;
  }

  const hex = Array.from(out, (byte) => byte.toString(16).padStart(2, "0"));
  return (
    `${hex.slice(0, 4).join("")}` +
    `-${hex.slice(4, 6).join("")}` +
    `-${hex.slice(6, 8).join("")}` +
    `-${hex.slice(8, 10).join("")}` +
    `-${hex.slice(10, 16).join("")}`
  );
}
