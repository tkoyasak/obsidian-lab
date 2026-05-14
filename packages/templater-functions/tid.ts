/**
 * Generate a TID (Timestamp Identifier) as defined by the AT Protocol.
 *
 * @see https://atproto.com/specs/tid
 * @returns A 13-character base32-sortable encoded TID string
 */
const tid = (): string => {
  const timeUs = BigInt(Date.now()) * 1000n;
  const clockId = randomClockId();
  return encodeTid((timeUs << 10n) | clockId);
};

const randomClockId = (): bigint => {
  const buf = new Uint8Array(2);
  crypto.getRandomValues(buf);
  const view = new DataView(buf.buffer);
  return BigInt(view.getUint16(0) & 0x3ff);
};

const CHARSET = "234567abcdefghijklmnopqrstuvwxyz";

const encodeTid = (n: bigint): string => {
  let result = "";
  for (let i = 0; i < 13; i++) {
    result = CHARSET[Number(n & 31n)] + result;
    n >>= 5n;
  }
  return result;
};

module.exports = tid;
