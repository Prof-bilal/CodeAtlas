export interface RouteConfig37 { path: string; method: string; handler: string; }
export const routeConfig37 = { path: '/api/v1/resource37', method: 'GET', handler: 'handler37' };
export async function handler37(req: unknown, res: unknown): Promise<void> { console.log('Route 37'); }
