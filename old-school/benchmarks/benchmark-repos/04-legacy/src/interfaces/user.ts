// User interfaces - OLD
// DEPRECATED - use types/user.ts

export interface IUser {
  id: number;
  username: string;
  email: string;
}

export interface IUserService {
  findById(id: number): Promise<IUser | null>;
  findByEmail(email: string): Promise<IUser | null>;
  create(data: any): Promise<IUser>;
}
