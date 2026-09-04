export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  bcryptSaltRounds: 12,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 15,
  apiKeyPrefix: 'ak_',
  apiKeyLength: 32,
};
