export interface RouteConfig36 { path: string; method: string; handler: string; }
export const routeConfig36 = { path: '/api/v1/resource36', method: 'GET', handler: 'handler36' };
export async function handler36(req: unknown, res: unknown): Promise<void> { console.log('Route 36'); }
