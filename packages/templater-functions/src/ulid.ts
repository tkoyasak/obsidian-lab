import { ulid as generate_ulid } from "ulid";

const ulid = () => {
  return generate_ulid();
};

module.exports = ulid;
