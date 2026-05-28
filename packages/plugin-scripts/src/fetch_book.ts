// Fetches book metadata by ISBN and fills QuickAdd template variables.
//
// NDL Search (SRU, recordSchema=dcndl) is the primary bibliographic source;
// openBD supplements the cover image only. Designed to run as a QuickAdd macro
// before the Book Template expands {{VALUE:...}} placeholders. The macro itself
// returns an empty string; everything is delivered via qa.variables.

const NDL_SRU = "https://ndlsearch.ndl.go.jp/api/sru";
const OPENBD_GET = "https://api.openbd.jp/v1/get";

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

// --- filename sanitization -------------------------------------------------

// Obsidian rejects file names containing \ / : ; other characters are also
// problematic across filesystems. Substitute the full-width equivalent so the
// title stays visually intact (e.g. "Foo : Bar" -> "Foo ： Bar").
const FILENAME_CHAR_MAP: Record<string, string> = {
  "\\": "＼",
  "/": "／",
  ":": "：",
  "*": "＊",
  "?": "？",
  '"': "”",
  "<": "＜",
  ">": "＞",
  "|": "｜",
};

const sanitizeFilename = (s: string): string =>
  s.replace(/[\\/:*?"<>|]/g, (c) => FILENAME_CHAR_MAP[c] ?? "");

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

// --- main ------------------------------------------------------------------

const fetch_book = async (qa: Qa): Promise<string> => {
  // QuickAdd runs macros referenced in both the file name format and the
  // template body, sharing variables across the two passes. Skip the second
  // invocation so the ISBN prompt and HTTP fetches only happen once.
  if (typeof qa.variables.isbn === "string" && qa.variables.isbn) return "";

  const input = (await qa.quickAddApi.inputPrompt("ISBN")) ?? "";
  const isbn = normalizeIsbn(input);
  if (!isbn) qa.abort("Invalid ISBN");

  const ndlReq = qa.obsidian.requestUrl({
    url:
      `${NDL_SRU}?operation=searchRetrieve&query=${encodeURIComponent(`isbn=${isbn}`)}` +
      "&recordSchema=dcndl&maximumRecords=1&recordPacking=xml",
    method: "GET",
    throw: false,
  });
  const openBdReq = qa.obsidian.requestUrl({
    url: `${OPENBD_GET}?isbn=${isbn}`,
    method: "GET",
    throw: false,
  });
  const [ndlRes, openBdRes] = await Promise.all([ndlReq, openBdReq]);

  const ndl = ndlRes.status >= 200 && ndlRes.status < 300 ? parseNdl(ndlRes.text) : null;
  const openBd =
    openBdRes.status >= 200 && openBdRes.status < 300 ? parseOpenBd(openBdRes.text) : null;

  if (!ndl && !openBd) qa.abort("Book not found");

  // openBD pubdate can be more precise than NDL's year/month.
  let published = ndl?.published ?? null;
  const openBdPublished = padDate(openBd?.pubdate);
  if (dateSpecificity(openBdPublished) > dateSpecificity(published)) {
    published = openBdPublished;
  }

  const v = qa.variables;
  v.isbn = isbn;
  v.ndl_url = ndl?.ndl_url ?? "";
  v.title = ndl?.title ?? "";
  // Filename-safe variant for File Name Format (Obsidian forbids \ / :).
  v.title_filename = sanitizeFilename(ndl?.title ?? "");
  // Raw arrays — QuickAdd's Template Property Types (enableTemplatePropertyTypes)
  // renders them as YAML lists when they sit as the bare value of a frontmatter
  // key (e.g. `authors: {{VALUE:authors}}`).
  v.authors = ndl?.authors ?? [];
  v.translaters = ndl?.translaters ?? [];
  // Comma-joined inline form for scalar contexts like File Name Format.
  v.authors_inline = (ndl?.authors ?? []).join(", ");
  v.publisher = ndl?.publisher ?? "";
  v.published = published ?? "";
  v.language = ndl?.language ?? "";
  v.ndc10 = ndl?.ndc10 ?? "";
  v.thumbnail = openBd?.cover ?? "";

  return "";
};

module.exports = fetch_book;
