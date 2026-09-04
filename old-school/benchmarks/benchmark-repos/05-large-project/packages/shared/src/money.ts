export interface Money { amount: bigint; currency: string; display: string; }
export function createMoney(cents: number, currency: string): Money { const a = BigInt(Math.round(cents)); return { amount: a, currency: currency.toUpperCase(), display: formatMoney(a, currency) }; }
export function addMoney(a: Money, b: Money): Money { if (a.currency!==b.currency) throw new Error('Currency mismatch'); return createMoney(Number(a.amount+b.amount), a.currency); }
export function subtractMoney(a: Money, b: Money): Money { if (a.currency!==b.currency) throw new Error('Currency mismatch'); return createMoney(Number(a.amount-b.amount), a.currency); }
export function equalsMoney(a: Money, b: Money): boolean { return a.currency===b.currency&&a.amount===b.amount; }
export function isZero(a: Money): boolean { return a.amount===0n; }
function formatMoney(amount: bigint, currency: string): string { const s: Record<string,string> = {USD:'$',EUR:'\u20ac',GBP:'\u00a3',JPY:'\u00a5'}; return (s[currency]??currency+' ')+(Number(amount)/100).toFixed(2); }