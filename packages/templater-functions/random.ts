/**
 * Generate a random string encoded in Clockwork Base32.
 *
 * @param length - Number of random bytes to generate (default: 16)
 * @returns A Clockwork Base32 encoded string of `ceil(length * 8 / 5)` characters
 */
const random = (length: number = 16): string => {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return encodeClockworkBase32(buf);
};

const CLOCKWORK_BASE32_CHARSET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Encode the entire sequence in Clockwork Base32.
 *
 * @see https://gist.github.com/szktty/228f85794e4187882a77734c89c384a8
 */
const encodeClockworkBase32 = (u8array: Uint8Array): string => {
  let result = "";

  let acc = 0;
  let offset = 0;

  for (const byte of u8array) {
    acc = (acc << 8) | byte;
    offset += 8;

    while (offset >= 5) {
      offset -= 5;
      result += CLOCKWORK_BASE32_CHARSET.charAt((acc >> offset) & 0x1f);
    }
  }

  if (offset > 0) {
    result += CLOCKWORK_BASE32_CHARSET.charAt((acc << (5 - offset)) & 0x1f);
  }

  return result;
};

module.exports = random;
