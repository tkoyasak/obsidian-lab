import { encode } from "@uzmoi/clockwork-base32";

const random = (lenght: number = 16) => {
  const buf = new Uint8Array(lenght);
  crypto.getRandomValues(buf);
  return encode(buf);
};

module.exports = random;
