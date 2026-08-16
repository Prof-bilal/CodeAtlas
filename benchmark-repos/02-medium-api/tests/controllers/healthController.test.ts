import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthController } from '../../src/controllers/healthController.js';
import { databaseService } from '../../src/services/databaseService.js';
import { cacheService } from '../../src/services/cacheService.js';

vi.mock('../../src/services/databaseService.js');
vi.mock('../../src/services/cacheService.js');

describe('HealthController', () => {
  let controller: HealthController;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new HealthController();
    mockReq = {} as any;
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  });

  it('should return health status', async () => {
    vi.mocked(databaseService).checkHealth = vi.fn().mockResolvedValue(true);
    vi.mocked(cacheService).checkHealth = vi.fn().mockResolvedValue(true);
    await controller.getHealth(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalled();
  });
});
