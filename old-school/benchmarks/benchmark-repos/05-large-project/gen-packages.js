// gen-packages.js - Generates remaining packages (payments, notifications, analytics, search, storage, email, sms, push, webhooks, integrations, reporting, workflow, permissions, audit, config, logging, caching, queue, scheduler, monitoring, ui, shared-types)
const { ENTITIES, pick, write } = require('./gen-modules/utils');
const path = require('path');
const BASE = __dirname;
let count = 0;

const packageConfigs = [
  { name: 'payments', base: 'packages/payments/src', files: 150 },
  { name: 'notifications', base: 'packages/notifications/src', files: 100 },
  { name: 'analytics', base: 'packages/analytics/src', files: 150 },
  { name: 'search', base: 'packages/search/src', files: 100 },
  { name: 'storage', base: 'packages/storage/src', files: 100 },
  { name: 'email', base: 'packages/email/src', files: 80 },
  { name: 'sms', base: 'packages/sms/src', files: 60 },
  { name: 'push', base: 'packages/push/src', files: 60 },
  { name: 'webhooks', base: 'packages/webhooks/src', files: 80 },
  { name: 'integrations', base: 'packages/integrations/src', files: 120 },
  { name: 'reporting', base: 'packages/reporting/src', files: 120 },
  { name: 'workflow', base: 'packages/workflow/src', files: 100 },
  { name: 'permissions', base: 'packages/permissions/src', files: 80 },
  { name: 'audit', base: 'packages/audit/src', files: 80 },
  { name: 'config', base: 'packages/config/src', files: 60 },
  { name: 'logging', base: 'packages/logging/src', files: 60 },
  { name: 'caching', base: 'packages/caching/src', files: 60 },
  { name: 'queue', base: 'packages/queue/src', files: 80 },
  { name: 'scheduler', base: 'packages/scheduler/src', files: 60 },
  { name: 'monitoring', base: 'packages/monitoring/src', files: 80 },
];

for (const pkg of packageConfigs) {
  const base = path.join(BASE, pkg.base);
  
  // Service base
  write(path.join(base, 'service.ts'), `import { Logger, Result, Ok, Err } from '@atlas/shared';

export abstract class ${pkg.name.charAt(0).toUpperCase()+pkg.name.slice(1)}Service {
  protected logger: Logger;
  protected cache = new Map<string, { value: unknown; expiresAt: number }>();
  private metrics = { requests: 0, errors: 0, avgDuration: 0 };

  constructor(context: string) { this.logger = new Logger({ context }); }

  protected async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now(); this.metrics.requests++;
    try {
      const r = await fn();
      const d = Date.now() - start;
      this.metrics.avgDuration = (this.metrics.avgDuration * (this.metrics.requests - 1) + d) / this.metrics.requests;
      return r;
    } catch (e) { this.metrics.errors++; this.logger.error('Failed ' + operation, e as Error); throw e; }
  }

  protected getCached(key: string): unknown | undefined {
    const e = this.cache.get(key);
    if (e && Date.now() < e.expiresAt) return e.value;
    this.cache.delete(key);
    return undefined;
  }

  protected setCache(key: string, value: unknown, ttl = 300000): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttl });
  }

  getMetrics() { return { ...this.metrics }; }
}`);
  count++;

  write(path.join(base, 'index.ts'), `export * from './service.js';`);
  count++;

  // Generate package-specific files
  for (let i = 0; i < Math.min(pkg.files, 80); i++) {
    const type = pick(['service','handler','provider','adapter','validator','transformer','enricher','manager','helper','util','factory','builder','cache','queue','worker','scheduler','monitor','config','migration','seed','export','import','report','processor','aggregator','router','filter','deduplicator','validator']);
    const domain = pick(ENTITIES);
    const el = domain.toLowerCase();
    const pkgName = pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1);
    const tc = type.charAt(0).toUpperCase() + type.slice(1);
    
    write(path.join(base, `${el}-${type}-${i}.ts`), `import { Result, Ok, Err, Logger } from '@atlas/shared';

const logger = new Logger({ context: '${pkgName}.${domain}${tc}${i}' });

export interface Config${i} {
  enabled: boolean;
  timeout: number;
  retries: number;
  batchSize: number;
  cacheTTL: number;
  metadata: Record<string, unknown>;
}

export class ${domain}${tc}${i} {
  private config: Config${i};
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private metrics = { requests: 0, errors: 0, avgDuration: 0 };

  constructor(config?: Partial<Config${i}>) {
    this.config = { enabled: true, timeout: 30000, retries: 3, batchSize: 100, cacheTTL: 300000, metadata: {}, ...config };
  }

  async execute(input: { id?: string; operation: string; data: Record<string, unknown> }): Promise<Result<unknown>> {
    if (!this.config.enabled) return Ok({ disabled: true });
    this.metrics.requests++;
    const start = Date.now();
    try {
      const cacheKey = input.operation + ':' + (input.id ?? 'all');
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) return Ok(cached.value);

      logger.debug('Executing ' + input.operation);
      const result = await this.process(input);
      
      if (this.config.cacheTTL > 0) {
        this.cache.set(cacheKey, { value: result, expiresAt: Date.now() + this.config.cacheTTL });
      }

      const duration = Date.now() - start;
      this.metrics.avgDuration = (this.metrics.avgDuration * (this.metrics.requests - 1) + duration) / this.metrics.requests;
      return Ok(result);
    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed', error as Error);
      return Err(error as Error);
    }
  }

  private async process(input: { id?: string; operation: string; data: Record<string, unknown> }): Promise<unknown> {
    await new Promise(r => setTimeout(r, Math.random() * 5));
    return {
      processed: true,
      operation: input.operation,
      id: input.id,
      timestamp: new Date().toISOString(),
      metadata: this.config.metadata,
    };
  }

  async processBatch(items: Array<{ id: string; operation: string; data: Record<string, unknown> }>): Promise<Result<{ successful: number; failed: number; duration: number }>> {
    const start = Date.now();
    let successful = 0;
    let failed = 0;
    const chunks: typeof items[] = [];
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      chunks.push(items.slice(i, i + this.config.batchSize));
    }
    for (const chunk of chunks) {
      const results = await Promise.allSettled(chunk.map(item => this.execute(item)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) successful++;
        else failed++;
      }
    }
    return Ok({ successful, failed, duration: Date.now() - start });
  }

  async invalidateCache(pattern?: string): Promise<number> {
    if (!pattern) { this.cache.clear(); return 0; }
    let count = 0;
    for (const key of this.cache.keys()) { if (key.includes(pattern)) { this.cache.delete(key); count++; } }
    return count;
  }

  getStats() { return { ...this.metrics, cacheSize: this.cache.size, enabled: this.config.enabled }; }
  setEnabled(enabled: boolean): void { this.config.enabled = enabled; }
  setCacheTTL(ttl: number): void { this.config.cacheTTL = ttl; }
}`);
    count++;
  }
}

// Also generate the UI package
const uiBase = path.join(BASE, 'packages/ui/src');
write(path.join(uiBase, 'provider.ts'), `import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface UIContextValue {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  locale: string;
  setLocale: (locale: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [locale, setLocale] = useState('en');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const value = useMemo(() => ({ theme, setTheme, locale, setLocale, sidebarOpen, setSidebarOpen }), [theme, locale, sidebarOpen]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}`);
count++;

// Generate UI component files
for (let i = 0; i < 200; i++) {
  const comp = pick(['Button','Input','Select','Checkbox','Radio','Toggle','DatePicker','FileUpload','RichText','CodeEditor','Modal','Drawer','Popover','Tooltip','Dropdown','Menu','Tabs','Accordion','Stepper','Progress','Spinner','Skeleton','Avatar','Badge','Tag','Card','Table','List','Form','Layout','Header','Footer','Sidebar','Navigation','Search','Filter','Pagination','Chart','Calendar','Timeline','Kanban']);
  const el = comp.toLowerCase();
  
  write(path.join(uiBase, `components/${el}/${el}-${i}.tsx`), `import React, { useState, useCallback, useMemo, forwardRef } from 'react';

interface ${comp}Props${i} {
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
  onChange?: (value: unknown) => void;
  onClick?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const ${comp}${i} = forwardRef<HTMLDivElement, ${comp}Props${i}>(({
  id,
  className,
  style,
  disabled = false,
  loading = false,
  children,
  onChange,
  onClick,
  onFocus,
  onBlur,
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState<unknown>(null);

  const handleFocus = useCallback(() => { setIsFocused(true); onFocus?.(); }, [onFocus]);
  const handleBlur = useCallback(() => { setIsFocused(false); onBlur?.(); }, [onBlur]);
  const handleClick = useCallback(() => { if (!disabled && !loading) onClick?.(); }, [disabled, loading, onClick]);

  const containerStyle = useMemo(() => ({
    ...style,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }), [style, disabled]);

  return (
    <div
      ref={ref}
      id={id}
      className={[className, isFocused ? 'focused' : '', disabled ? 'disabled' : '', loading ? 'loading' : ''].filter(Boolean).join(' ')}
      style={containerStyle}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={disabled ? -1 : 0}
      data-testid="${el}-${i}"
    >
      {loading ? <span>Loading...</span> : children}
    </div>
  );
});

${comp}${i}.displayName = '${comp}${i}';
export default ${comp}${i};`);
  count++;
}

for (let i = 0; i < 100; i++) {
  const hook = ['useTheme','useBreakpoint','useMediaQuery','useClickOutside','useKeyPress','useLocalStorage','useSessionStorage','useDebounce','useThrottle','useIntersection','useClipboard','useNetwork','useGeolocation','useInterval','useTimeout','usePrevious','useToggle','useCounter','useForm','useTable'];
  const h = hook[i % hook.length];
  write(path.join(uiBase, `hooks/${h.toLowerCase()}-${i}.ts`), `import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export function ${h}${i}<T = unknown>(...args: unknown[]) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const execute = useCallback(async (fn: () => Promise<T>) => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (mountedRef.current) setValue(result);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  return useMemo(() => ({ value, loading, error, execute, setValue }), [value, loading, error, execute]);
}`);
  count++;
}

for (let i = 0; i < 100; i++) {
  const type = pick(['theme','tokens','variables','animations','responsive','typography','colors','spacing','shadows','borders','icons']);
  write(path.join(uiBase, `styles/${type}-${i}.ts`), `export interface ${type.charAt(0).toUpperCase()+type.slice(1)}Config${i} {
  prefix?: string;
  scales?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}

export const ${type}${i}: ${type.charAt(0).toUpperCase()+type.slice(1)}Config${i} = {
  prefix: 'atlas',
  scales: {},
  overrides: {},
};

export function get${type.charAt(0).toUpperCase()+type.slice(1)}${i}(key: string): unknown {
  return ${type}${i}.scales?.[key] ?? ${type}${i}.overrides?.[key];
}

export function set${type.charAt(0).toUpperCase()+type.slice(1)}${i}(key: string, value: unknown): void {
  if (!${type}${i}.scales) ${type}${i}.scales = {};
  (${type}${i}.scales as Record<string, unknown>)[key] = value;
}`);
  count++;
}

console.log('Packages created: ' + count + ' files');
