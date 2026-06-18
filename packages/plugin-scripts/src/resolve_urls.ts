// Turn bare URLs in the input into Markdown links titled by each page's
// <title>. Designed to run as a QuickAdd macro: reads qa.variables.input (or
// prompts when empty), fetches titles in parallel, and writes the result back.
// URLs whose title can't be fetched are left untouched.

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/g;
const TRAILING_PUNCT_REGEX = /[.,;:!?)\]}>'"`]+$/;

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)));

const extractTitle = (html: string): string | null => {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  const title = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return title || null;
};

const fetchTitle = async (qa: Qa, url: string): Promise<string | null> => {
  try {
    const res = await qa.obsidian.requestUrl({
      url,
      method: "GET",
      headers: { "Accept-Language": "ja,en;q=0.8" },
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) return null;
    return extractTitle(res.text);
  } catch {
    return null;
  }
};

const resolve_urls = async (qa: Qa): Promise<string> => {
  let input = String(qa.variables.input ?? "").trim();
  if (!input) {
    input = (await qa.quickAddApi.inputPrompt("Input")) ?? "";
    if (!input) qa.abort("Input is required");
  }
  const matches = [...input.matchAll(URL_REGEX)];
  if (matches.length === 0) {
    qa.variables.input = input;
    return input;
  }

  const targets = matches.map((m) => {
    const raw = m[0];
    const trail = raw.match(TRAILING_PUNCT_REGEX)?.[0] ?? "";
    const url = trail ? raw.slice(0, -trail.length) : raw;
    return { index: m.index ?? 0, raw, url, trail };
  });

  const titles = await Promise.all(targets.map((t) => fetchTitle(qa, t.url)));

  let out = "";
  let cursor = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t) continue;
    const title = titles[i];
    out += input.slice(cursor, t.index);
    out += title ? `[${title}](${t.url})${t.trail}` : t.raw;
    cursor = t.index + t.raw.length;
  }
  out += input.slice(cursor);

  qa.variables.input = out;
  return out;
};

module.exports = resolve_urls;
