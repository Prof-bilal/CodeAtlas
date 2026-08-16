export interface RouteConfig4 { path: string; method: string; handler: string; }
export const routeConfig4 = { path: '/api/v1/resource4', method: 'GET', handler: 'handler4' };
export async function handler4(req: unknown, res: unknown): Promise<void> { console.log('Route 4'); }
