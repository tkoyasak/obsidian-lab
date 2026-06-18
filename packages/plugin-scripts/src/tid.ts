// Generate a TID (Timestamp Identifier), a 13-character base32-sortable string,
// as defined by the AT Protocol. https://atproto.com/specs/tid

const BASE32_SORTABLE_CHARSET = "234567abcdefghijklmnopqrstuvwxyz";

// Encode a 64-bit integer as a 13-character base32-sortable string.
// https://atproto.com/specs/tid#tid-string-encoding
const encodeBase32Sortable = (n: bigint): string => {
  let result = "";
  for (let i = 0; i < 13; i++) {
    result = BASE32_SORTABLE_CHARSET.charAt(Number(n & 0x1fn)) + result;
    n >>= 5n;
  }
  return result;
};

// Generate a random 10-bit clock identifier for collision avoidance.
const randomClockId = (): bigint => {
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  const view = new DataView(buf.buffer);
  return BigInt(view.getUint16(0) & 0x3ff);
};

const tid = (): string => {
  const timeUs = BigInt(Date.now()) * 1000n;
  const clockId = randomClockId();
  return encodeBase32Sortable((timeUs << 10n) | clockId);
};

module.exports = tid;
