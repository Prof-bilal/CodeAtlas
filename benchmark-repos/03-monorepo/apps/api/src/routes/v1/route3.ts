export interface RouteConfig3 { path: string; method: string; handler: string; }
export const routeConfig3 = { path: '/api/v1/resource3', method: 'GET', handler: 'handler3' };
export async function handler3(req: unknown, res: unknown): Promise<void> { console.log('Route 3'); }
