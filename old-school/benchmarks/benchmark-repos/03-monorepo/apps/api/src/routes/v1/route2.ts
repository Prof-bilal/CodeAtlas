export interface RouteConfig2 { path: string; method: string; handler: string; }
export const routeConfig2 = { path: '/api/v1/resource2', method: 'GET', handler: 'handler2' };
export async function handler2(req: unknown, res: unknown): Promise<void> { console.log('Route 2'); }
