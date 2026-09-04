// User types - DUPLICATE
// See also common.ts and userService.ts

export interface UserType {
  id: string;
  email: string;
  username: string;
  role: string;
}

export type UserRole = 'admin' | 'user' | 'viewer';
