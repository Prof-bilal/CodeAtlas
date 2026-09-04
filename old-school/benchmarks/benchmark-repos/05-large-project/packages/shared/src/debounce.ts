export function debounce<T extends (...args: any[]) => any>(...args: any[]): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}