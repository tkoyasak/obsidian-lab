// Fetch book metadata by ISBN and fill QuickAdd template variables.
//
// NDL Search (SRU, recordSchema=dcndl) is the primary bibliographic source;
// openBD supplements the cover image only. Designed to run as a Templater user
// function: the template calls it once, renames the note to the returned
// `filename` (『title』 authors) and fills frontmatter from the other returned
// bibliographic fields.

import { sanitizeFilename } from "./filename";

const NDL_SRU = "https://ndlsearch.ndl.go.jp/api/sru";
const OPENBD_GET = "https://api.openbd.jp/v1/get";
const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";
const OPENLIBRARY_BOOKS = "https://openlibrary.org/api/books";
const AMAZON_COVER = "https://m.media-amazon.com/images/P";

// dc:creator role suffixes. Longer forms must come first so e.g. "監訳" wins
// over "訳". Roles not listed fall back to authors.
const AUTHOR_ROLES = ["著者", "編著", "共著", "監修", "編", "著"];
const TRANSLATER_ROLES = ["監訳", "共訳", "翻訳", "訳"];

// ISO639-2 (NDL) -> ISO639-1. Unknown codes are passed through unchanged.
const LANG_MAP: Record<string, string> = {
  jpn: "ja",
  eng: "en",
  fra: "fr",
  fre: "fr",
  deu: "de",
  ger: "de",
  spa: "es",
  ita: "it",
  zho: "zh",
  chi: "zh",
  kor: "ko",
  rus: "ru",
  por: "pt",
};

// --- ISBN normalization ----------------------------------------------------

const isbn13CheckDigit = (twelve: string): string => {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
};

// Strip separators and coerce to a 13-digit ISBN (the schema requires plain 13
// digits). ISBN-10 input is converted via the 978 prefix + recomputed check
// digit. Returns null when the input is not a recognizable ISBN.
const normalizeIsbn = (raw: string): string | null => {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^97[89][0-9]{10}$/.test(s)) return s;
  if (/^[0-9]{9}[0-9X]$/.test(s)) {
    const core = `978${s.slice(0, 9)}`;
    return core + isbn13CheckDigit(core);
  }
  return null;
};

// Reverse: ISBN-13 (978-prefixed) -> ISBN-10 for endpoints keyed on ISBN-10
// (notably Amazon cover URLs). 979-prefixed ISBNs have no ISBN-10 equivalent.
const isbn13to10 = (isbn13: string): string | null => {
  if (!isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
};

// --- date / published ------------------------------------------------------

// Pad a partial book date to a full YYYY-MM-DD (the schema enforces date
// format). Missing month/day default to 01. Accepts "2020", "2020.3",
// "2020-03", "202003", "20200315", etc.
const padDate = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, "");
  let year: string;
  let month = "01";
  let day = "01";
  if (/^\d{8}$/.test(digits)) {
    year = digits.slice(0, 4);
    month = digits.slice(4, 6);
    day = digits.slice(6, 8);
  } else if (/^\d{6}$/.test(digits)) {
    year = digits.slice(0, 4);
    month = digits.slice(4, 6);
  } else {
    const m = raw.match(/(\d{4})(?:[.\-/](\d{1,2}))?(?:[.\-/](\d{1,2}))?/);
    if (!m) return null;
    year = m[1]!;
    if (m[2]) month = m[2].padStart(2, "0");
    if (m[3]) day = m[3].padStart(2, "0");
  }
  return `${year}-${month}-${day}`;
};

// Prefer whichever source carries more precision (day > month > year only).
const dateSpecificity = (d: string | null): number => {
  if (!d) return -1;
  const digits = (d.match(/(\d{4})[.\-/]?(\d{1,2})?[.\-/]?(\d{1,2})?/) ?? []).slice(1);
  return digits.filter(Boolean).length;
};

// --- filename --------------------------------------------------------------

// The macro return value becomes the note filename. Wrap the sanitized title in
// 『』 and append comma-joined authors: 『title』 author1, author2.
const buildFilename = (title: string, authors: string[]): string =>
  `『${sanitizeFilename(title)}』 ${authors.join(", ")}`;

// --- DOM helpers (namespace-tolerant) --------------------------------------

const localName = (n: string): string => {
  const i = n.indexOf(":");
  return i === -1 ? n : n.slice(i + 1);
};

// getElementsByTagName with the qualified name, falling back to a localName
// scan so it works regardless of how the parser exposes namespaces.
const els = (root: Element | Document, qualified: string): Element[] => {
  const direct = Array.from(root.getElementsByTagName(qualified));
  if (direct.length > 0) return direct;
  const want = localName(qualified);
  return Array.from(root.getElementsByTagName("*")).filter((e) => localName(e.tagName) === want);
};

const firstText = (root: Element | Document, qualified: string): string => {
  const el = els(root, qualified)[0];
  return el?.textContent?.trim() ?? "";
};

// Read an attribute by qualified name, falling back to a localName scan.
const attr = (el: Element, qualified: string): string => {
  const direct = el.getAttribute(qualified);
  if (direct) return direct;
  const want = localName(qualified);
  for (const a of Array.from(el.attributes)) {
    if (localName(a.name) === want) return a.value;
  }
  return "";
};

// --- NDL parsing -----------------------------------------------------------

interface NdlData {
  ndl_url: string;
  title: string;
  authors: string[];
  translaters: string[];
  publisher: string;
  published: string | null;
  language: string;
  ndc10: string;
}

const splitCreator = (text: string): { name: string; role: "author" | "translater" } => {
  const trimmed = text.trim();
  for (const role of TRANSLATER_ROLES) {
    if (trimmed.endsWith(role)) {
      return { name: trimmed.slice(0, -role.length).trim(), role: "translater" };
    }
  }
  for (const role of AUTHOR_ROLES) {
    if (trimmed.endsWith(role)) {
      return { name: trimmed.slice(0, -role.length).trim(), role: "author" };
    }
  }
  return { name: trimmed, role: "author" };
};

const parseNdl = (xml: string): NdlData | null => {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  if (Number(firstText(doc, "numberOfRecords")) === 0) return null;

  const res = els(doc, "dcndl:BibResource")[0];
  if (!res) return null;

  const ndl_url = attr(res, "rdf:about").replace(/#material$/, "");
  const title = firstText(res, "dcterms:title");

  const authors: string[] = [];
  const translaters: string[] = [];
  for (const c of els(res, "dc:creator")) {
    const text = c.textContent?.trim();
    if (!text) continue;
    const { name, role } = splitCreator(text);
    if (!name) continue;
    (role === "translater" ? translaters : authors).push(name);
  }

  // Skip Agents marked as 発売 (distributor); take the first real publisher.
  let publisher = "";
  for (const p of els(res, "dcterms:publisher")) {
    const isDistributor = els(p, "dcterms:description").some((d) =>
      (d.textContent ?? "").includes("発売"),
    );
    if (isDistributor) continue;
    const name = firstText(p, "foaf:name");
    if (name) {
      publisher = name;
      break;
    }
  }

  const published = padDate(firstText(res, "dcterms:date") || firstText(res, "dcterms:issued"));

  const langRaw = firstText(res, "dcterms:language").toLowerCase();
  const language = langRaw ? (LANG_MAP[langRaw] ?? langRaw) : "";

  // Prefer ndc10, fall back to ndc9.
  let ndc10 = "";
  let ndc9 = "";
  for (const s of els(res, "dcterms:subject")) {
    const resource = attr(s, "rdf:resource");
    const m10 = resource.match(/ndc10\/([\d.]+)/);
    if (m10) ndc10 = m10[1]!;
    const m9 = resource.match(/ndc9\/([\d.]+)/);
    if (m9) ndc9 = m9[1]!;
  }

  return {
    ndl_url,
    title,
    authors,
    translaters,
    publisher,
    published,
    language,
    ndc10: ndc10 || ndc9,
  };
};

// --- openBD ----------------------------------------------------------------

interface OpenBdData {
  cover: string;
  pubdate: string;
}

const parseOpenBd = (json: string): OpenBdData | null => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const entry = Array.isArray(data) ? data[0] : null;
  if (!entry) return null;
  const summary = (entry as { summary?: { cover?: string; pubdate?: string } }).summary ?? {};
  return { cover: summary.cover ?? "", pubdate: summary.pubdate ?? "" };
};

// --- cover fallbacks -------------------------------------------------------

const parseGoogleCover = (json: string): string => {
  try {
    const data = JSON.parse(json) as {
      items?: Array<{
        volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } };
      }>;
    };
    const links = data.items?.[0]?.volumeInfo?.imageLinks;
    const url = links?.thumbnail ?? links?.smallThumbnail ?? "";
    // Google Books often returns http URLs; upgrade so Obsidian can embed them.
    return url.replace(/^http:/, "https:");
  } catch {
    return "";
  }
};

// Amazon serves a ~43-byte 1x1 placeholder when the cover image is missing,
// so look at content-length via HEAD rather than fetching the bytes.
const fetchAmazonCover = async (tp: Tp, isbn13: string): Promise<string> => {
  const isbn10 = isbn13to10(isbn13);
  if (!isbn10) return "";
  const url = `${AMAZON_COVER}/${isbn10}.jpg`;
  const res = await tp.obsidian.requestUrl({ url, method: "HEAD", throw: false });
  if (res.status < 200 || res.status >= 300) return "";
  const len = Number(res.headers["content-length"] ?? "0");
  return len > 100 ? url : "";
};

const parseOpenLibraryCover = (json: string, isbn: string): string => {
  try {
    const data = JSON.parse(json) as Record<
      string,
      { cover?: { large?: string; medium?: string; small?: string } }
    >;
    const cover = data[`ISBN:${isbn}`]?.cover;
    return cover?.large ?? cover?.medium ?? cover?.small ?? "";
  } catch {
    return "";
  }
};

// --- main ------------------------------------------------------------------

interface Book {
  isbn: string;
  ndl_url: string;
  title: string;
  authors: string[];
  translaters: string[];
  publisher: string;
  published: string;
  language: string;
  ndc10: string;
  thumbnail: string;
  filename: string;
}

const fetch_book = async (tp: Tp): Promise<Book> => {
  const input = (await tp.system.prompt("ISBN", "", true, false)) ?? "";
  const isbn = normalizeIsbn(input);
  if (!isbn) throw new Error("Invalid ISBN");

  const ndlReq = tp.obsidian.requestUrl({
    url:
      `${NDL_SRU}?operation=searchRetrieve&query=${encodeURIComponent(`isbn=${isbn}`)}` +
      "&recordSchema=dcndl&maximumRecords=1&recordPacking=xml",
    method: "GET",
    throw: false,
  });
  const openBdReq = tp.obsidian.requestUrl({
    url: `${OPENBD_GET}?isbn=${isbn}`,
    method: "GET",
    throw: false,
  });
  // Cover fallbacks fired in parallel; openBD often has no cover for older or
  // technical books, where Google Books / Open Library typically do.
  const googleReq = tp.obsidian.requestUrl({
    url: `${GOOGLE_BOOKS}?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)`,
    method: "GET",
    throw: false,
  });
  const openLibReq = tp.obsidian.requestUrl({
    url: `${OPENLIBRARY_BOOKS}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    method: "GET",
    throw: false,
  });
  const [ndlRes, openBdRes, googleRes, openLibRes, amazonCover] = await Promise.all([
    ndlReq,
    openBdReq,
    googleReq,
    openLibReq,
    fetchAmazonCover(tp, isbn),
  ]);

  const ndl = ndlRes.status >= 200 && ndlRes.status < 300 ? parseNdl(ndlRes.text) : null;
  const openBd =
    openBdRes.status >= 200 && openBdRes.status < 300 ? parseOpenBd(openBdRes.text) : null;
  const googleCover =
    googleRes.status >= 200 && googleRes.status < 300 ? parseGoogleCover(googleRes.text) : "";
  const openLibCover =
    openLibRes.status >= 200 && openLibRes.status < 300
      ? parseOpenLibraryCover(openLibRes.text, isbn)
      : "";

  if (!ndl && !openBd) throw new Error("Book not found");

  // openBD pubdate can be more precise than NDL's year/month.
  let published = ndl?.published ?? null;
  const openBdPublished = padDate(openBd?.pubdate);
  if (dateSpecificity(openBdPublished) > dateSpecificity(published)) {
    published = openBdPublished;
  }

  const title = ndl?.title ?? "";
  const authors = ndl?.authors ?? [];
  return {
    isbn,
    ndl_url: ndl?.ndl_url ?? "",
    title,
    authors,
    translaters: ndl?.translaters ?? [],
    publisher: ndl?.publisher ?? "",
    published: published ?? "",
    language: ndl?.language ?? "",
    ndc10: ndl?.ndc10 ?? "",
    // Priority: openBD (official JP data) > Amazon JP (broad JP coverage) >
    // Google Books > Open Library.
    thumbnail: openBd?.cover || amazonCover || googleCover || openLibCover || "",
    filename: buildFilename(title, authors),
  };
};

module.exports = fetch_book;
