const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );

export const sanitizeEmailPreviewHtml = (html: string): string => {
  let safe = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:src|href)\s*=\s*(["'])(?!https?:\/\/)[\s\S]*?\1/gi, "");
  safe = safe.replace(/<a\b([^>]*)>/gi, (_match, attributes: string) =>
    /href\s*=\s*["']https?:\/\//i.test(attributes)
      ? `<a${attributes} target="_blank" rel="noopener noreferrer">`
      : `<a aria-disabled="true">`,
  );
  return safe;
};

export const linkifyEmailPreviewText = (text: string): string =>
  escapeHtml(text).replace(
    /https?:\/\/[^\s<]+/g,
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
