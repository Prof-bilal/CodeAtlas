// User validators - OLD
// DEPRECATED

export function validateUsername(username: string): boolean {
  return username && username.length >= 3 && username.length <= 30;
}

export function validateRole(role: string): boolean {
  return ['admin', 'user', 'viewer'].includes(role);
}
