export type MarkdownBlock = {
  kind: "heading" | "paragraph" | "list" | "code";
  lines: string[];
};
export type MarkdownInline = {
  kind: "text" | "strong" | "code" | "link";
  text: string;
  href?: string;
};

export const issueMarkdownTask = (
  line: string,
): { checked: boolean; text: string } | null => {
  const task = /^\[([ xX])\](?:[ \t]+(.*)|$)/.exec(line);
  return task
    ? { checked: task[1].toLowerCase() === "x", text: task[2] ?? "" }
    : null;
};

export const issueMarkdownBlocks = (body: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  let current: MarkdownBlock | null = null;
  let fenced = false;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      current = fenced ? { kind: "code", lines: [] } : null;
      if (current) blocks.push(current);
      continue;
    }
    if (fenced) {
      current?.lines.push(line);
      continue;
    }
    if (!line.trim()) {
      current = null;
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", lines: [heading[1]] });
      current = null;
      continue;
    }
    const item = /^\s*(?:[-*+] |\d+\. )(.+)$/.exec(line);
    const kind = item ? "list" : "paragraph";
    if (!current || current.kind !== kind) {
      current = { kind, lines: [] };
      blocks.push(current);
    }
    current.lines.push(item ? item[1] : line);
  }
  return blocks;
};

export const issueMarkdownInline = (
  text: string,
  baseUrl: string,
): MarkdownInline[] => {
  const parts: MarkdownInline[] = [];
  const pattern =
    /\*\*([^*\n]+)\*\*|`([^`\n]+)`|(!?)\[([^\]\n]+)\]\(([^\s)]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ kind: "text", text: text.slice(offset, match.index) });
    if (match[1]) parts.push({ kind: "strong", text: match[1] });
    else if (match[2]) parts.push({ kind: "code", text: match[2] });
    else {
      let href: string | undefined;
      try {
        const url = new URL(match[5], baseUrl);
        if (["https:", "http:"].includes(url.protocol)) href = url.href;
      } catch {
        /* 不正なリンクは文字列として表示する。 */
      }
      // 外部画像は自動読込みせず、リンクとして確認できるようにする。
      parts.push(
        href
          ? { kind: "link", text: match[4], href }
          : { kind: "text", text: match[0] },
      );
    }
    offset = match.index + match[0].length;
  }
  if (offset < text.length)
    parts.push({ kind: "text", text: text.slice(offset) });
  return parts;
};
