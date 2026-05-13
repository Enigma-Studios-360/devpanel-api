export const slugify = (input: string): string => {
  if (!input) return '';

  return input
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const slugifyWithSuffix = (input: string, suffix: string): string => {
  const base = slugify(input);
  const safeSuffix = slugify(suffix);
  return safeSuffix ? `${base}-${safeSuffix}` : base;
};
