// User model - OLD
// DEPRECATED - use UserService types

export interface UserModel {
  id: number;
  username: string;
  email: string;
  password: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export function createUserModel(data: any): UserModel {
  return {
    id: data.id || 0,
    username: data.username,
    email: data.email,
    password: data.password,
    role: data.role || 'user',
    created_at: data.created_at || new Date().toISOString(),
    updated_at: data.updated_at || new Date().toISOString(),
  };
}

export function sanitizeUser(user: UserModel) {
  const { password, ...rest } = user;
  return rest;
}
