export interface RouteConfig1 { path: string; method: string; handler: string; }
export const routeConfig1 = { path: '/api/v1/resource1', method: 'GET', handler: 'handler1' };
export async function handler1(req: unknown, res: unknown): Promise<void> { console.log('Route 1'); }
