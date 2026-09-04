import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number {
    if (times > 3) {
      return -1;
    }
    return Math.min(times * 200, 2000);
  },
};

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);
    
    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const value = await client.get(key);
  
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export async function cacheSet(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
  const client = getRedisClient();
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  
  if (ttlSeconds > 0) {
    await client.setex(key, ttlSeconds, serialized);
  } else {
    await client.set(key, serialized);
  }
}

export async function cacheDelete(pattern: string): Promise<void> {
  const client = getRedisClient();
  const keys = await client.keys(pattern);
  
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

export async function publishEvent(channel: string, data: any): Promise<void> {
  const client = getRedisClient();
  await client.publish(channel, JSON.stringify(data));
}

export function subscribeEvent(channel: string, handler: (data: any) => void): void {
  const client = getRedisClient();
  client.subscribe(channel);
  
  client.on('message', (receivedChannel, message) => {
    if (receivedChannel === channel) {
      try {
        const data = JSON.parse(message);
        handler(data);
      } catch (error) {
        console.error('Failed to parse Redis message:', error);
      }
    }
  });
}
