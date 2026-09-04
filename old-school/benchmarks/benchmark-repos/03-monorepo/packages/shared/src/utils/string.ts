export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function decapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

export function camelCase(str: string): string {
  return str
    .replace(/[-_ ]+([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^[A-Z]/, letter => letter.toLowerCase());
}

export function snakeCase(str: string): string {
  return str
    .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    .replace(/[- ]+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');
}

export function kebabCase(str: string): string {
  return str
    .replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
    .replace(/[_ ]+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

export function pascalCase(str: string): string {
  return camelCase(str).replace(/^./, letter => letter.toUpperCase());
}

export function titleCase(str: string): string {
  return str
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
}

export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

export function padStart(str: string, targetLength: number, padChar: string = ' '): string {
  if (str.length >= targetLength) return str;
  const padding = padChar.repeat(targetLength - str.length);
  return padding + str;
}

export function padEnd(str: string, targetLength: number, padChar: string = ' '): string {
  if (str.length >= targetLength) return str;
  const padding = padChar.repeat(targetLength - str.length);
  return str + padding;
}

export function trim(str: string): string {
  return str.trim();
}

export function trimStart(str: string): string {
  return str.trimStart();
}

export function trimEnd(str: string): string {
  return str.trimEnd();
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, char => map[char]);
}

export function unescapeHtml(str: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
  };
  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, char => map[char]);
}

export function countOccurrences(str: string, substr: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(substr, pos)) !== -1) {
    count++;
    pos += substr.length;
  }
  return count;
}

export function reverse(str: string): string {
  return str.split('').reverse().join('');
}

export function isPalindrome(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === reverse(cleaned);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateSlug(str: string): string {
  return slugify(str);
}

export function extractEmails(str: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return str.match(emailRegex) || [];
}

export function extractUrls(str: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  return str.match(urlRegex) || [];
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 4) return phone;
  return '*'.repeat(cleaned.length - 4) + cleaned.slice(-4);
}
