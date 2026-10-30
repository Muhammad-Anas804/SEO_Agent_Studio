/**
 * Minimal HTML helpers based on regular expressions.
 * Good enough for checking tags and attributes. It is NOT a full parser,
 * so do not use it for security decisions or for pages that need rendering.
 */

export const collapseWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Removes tags from a fragment and returns the visible text. */
export const stripTags = (fragment: string): string =>
  collapseWhitespace(fragment.replace(/<[^>]*>/g, " "));

/** Visible text of a whole page (scripts and styles removed). */
export function toPlainText(html: string): string {
  return stripTags(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ""));
}

/** Every opening tag with the given name, e.g. findTags(html, "img"). */
export function findTags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

/** Value of an attribute inside a single tag, or null if the attribute is absent. */
export function getAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** content="..." of <meta name|property="value">, or null if the tag is missing. */
export function getMeta(html: string, key: "name" | "property", value: string): string | null {
  for (const tag of findTags(html, "meta")) {
    if ((getAttr(tag, key) ?? "").toLowerCase() === value) return getAttr(tag, "content") ?? "";
  }
  return null;
}

export function getTitle(html: string): string {
  return collapseWhitespace(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

/**
 * Runs a global regex over text and maps every match.
 * Uses a fresh RegExp each call, so there is no shared lastIndex state.
 */
export function collectMatches<T>(text: string, pattern: RegExp, pick: (m: RegExpExecArray) => T): T[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: T[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(pick(m));
  return out;
}