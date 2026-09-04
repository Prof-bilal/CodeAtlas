export function now(): Date { return new Date(); }
export function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
export function addHours(d: Date, n: number): Date { const r = new Date(d); r.setHours(r.getHours()+n); return r; }
export function addMinutes(d: Date, n: number): Date { const r = new Date(d); r.setMinutes(r.getMinutes()+n); return r; }
export function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(r.getMonth()+n); return r; }
export function diffDays(a: Date, b: Date): number { return Math.floor((a.getTime()-b.getTime())/86400000); }
export function diffHours(a: Date, b: Date): number { return Math.floor((a.getTime()-b.getTime())/3600000); }
export function isBefore(a: Date, b: Date): boolean { return a.getTime()<b.getTime(); }
export function isAfter(a: Date, b: Date): boolean { return a.getTime()>b.getTime(); }
export function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0,0,0,0); return r; }
export function endOfDay(d: Date): Date { const r = new Date(d); r.setHours(23,59,59,999); return r; }
export function formatISO(d: Date): string { return d.toISOString(); }
export function parseISO(v: string): Date { const d = new Date(v); if (isNaN(d.getTime())) throw new Error('Invalid date: '+v); return d; }
export function toUnix(d: Date): number { return Math.floor(d.getTime()/1000); }