export function throttle<T extends (...args: any[]) => any>(...args: any[]): (...args: Parameters<T>) => void {
  let inThrottle = false; return (...args) => { if (!inThrottle) { fn(...args); inThrottle = true; setTimeout(() => inThrottle = false, limit); } };
}