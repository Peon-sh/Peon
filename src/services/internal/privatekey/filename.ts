/** Safe download basename for a private key (.pem). */
export function privateKeyPemFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'private-key'}.pem`;
}
