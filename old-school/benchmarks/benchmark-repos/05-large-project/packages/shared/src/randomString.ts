export function randomString<number>(...args: any[]): string {
  let result = ''; for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length)); return result;
}