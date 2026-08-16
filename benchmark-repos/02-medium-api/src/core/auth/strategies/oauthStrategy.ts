import { UserRepository } from '../../../repositories/userRepository.js';
import { UserModel } from '../../../models/user.js';

export interface OAuthProfile {
  provider: 'google' | 'github' | 'microsoft';
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

export class OAuthStrategy {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async authenticate(profile: OAuthProfile): Promise<{ user: UserModel; isNew: boolean }> {
    let user = await this.userRepository.findByEmail(profile.email);
    let isNew = false;

    if (!user) {
      user = await this.userRepository.create({
        email: profile.email,
        password: crypto.randomBytes(32).toString('hex'),
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
      
      await this.userRepository.update(user.id, {
        emailVerified: true,
      });
      
      isNew = true;
    }

    return { user, isNew };
  }

  async linkAccount(userId: string, profile: OAuthProfile): Promise<void> {
    const existingUser = await this.userRepository.findByEmail(profile.email);
    
    if (existingUser && existingUser.id !== userId) {
      throw new Error('Email already associated with another account');
    }

    await this.userRepository.update(userId, {
      emailVerified: true,
    });
  }

  async unlinkAccount(userId: string, provider: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    const linkedProviders = user.metadata?.linkedProviders || [];
    const updatedProviders = linkedProviders.filter((p: string) => p !== provider);
    
    await this.userRepository.update(userId, {
      metadata: { linkedProviders: updatedProviders },
    });
  }
}

import crypto from 'crypto';
