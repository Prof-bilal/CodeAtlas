export interface RouteConfig27 { path: string; method: string; handler: string; }
export const routeConfig27 = { path: '/api/v1/resource27', method: 'GET', handler: 'handler27' };
export async function handler27(req: unknown, res: unknown): Promise<void> { console.log('Route 27'); }
