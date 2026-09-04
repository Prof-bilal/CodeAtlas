import jwt from 'jsonwebtoken';
import { authConfig } from '../../config/auth.js';
import { userRepository } from '../../repositories/userRepository.js';
import { UserModel } from '../../models/user.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export class JwtStrategy {
  async verify(token: string): Promise<UserModel> {
    try {
      const payload = jwt.verify(token, authConfig.jwtSecret) as JwtPayload;
      const user = await userRepository.findById(payload.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  generateToken(user: UserModel): string {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      authConfig.jwtSecret,
      { expiresIn: authConfig.jwtExpiresIn }
    );
  }

  generateRefreshToken(user: UserModel): string {
    return jwt.sign(
      { userId: user.id, type: 'refresh' },
      authConfig.jwtSecret,
      { expiresIn: authConfig.refreshTokenExpiresIn }
    );
  }

  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch {
      return null;
    }
  }
}

export const jwtStrategy = new JwtStrategy();
