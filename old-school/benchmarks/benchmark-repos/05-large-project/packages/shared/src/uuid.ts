let _crypto: typeof globalThis.crypto | undefined;
try { _crypto = globalThis.crypto; } catch {}
export function generateId(): string { if (_crypto?.randomUUID) return _crypto.randomUUID(); return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }); }
export function generateShortId(): string { return Math.random().toString(36).substring(2,10); }
export function isValidUUID(v: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }