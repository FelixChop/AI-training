export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

export function slugFromFilename(name: string): string {
  const withoutExt = name.replace(/\.(md|markdown)$/i, '');
  return slugify(withoutExt);
}
