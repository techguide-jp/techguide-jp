export const adminViewHref = (href: string): string => {
  const [path, fragment] = href.split("#", 2);
  return `${path}${path.includes("?") ? "&" : "?"}mode=admin${fragment ? `#${fragment}` : ""}`;
};
