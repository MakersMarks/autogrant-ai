export function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/gi, " ")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/'/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferEntityTypes(title: string, agency: string): string[] {
  const text = `${title} ${agency}`.toLowerCase();
  const types = new Set<string>();
  if (/(business|manufacturer|manufacturing|startup|innovation|commerce|agriculture|dairy|butchery|value-added|sbir|sttr|entrepreneur)/i.test(text)) {
    types.add("for_profit");
    types.add("small_business");
  }
  if (/(nonprofit|501\(c\)|community|library|museum|arts|historic|conservation|humanities|victim|youth|housing|health)/i.test(text)) {
    types.add("nonprofit_501c3");
  }
  if (/(municipality|city|county|government|tribal|school|public safety|dot|transportation|water|wastewater)/i.test(text)) {
    types.add("government_entity");
  }
  if (types.size === 0) {
    types.add("for_profit");
    types.add("nonprofit_501c3");
  }
  return Array.from(types);
}
