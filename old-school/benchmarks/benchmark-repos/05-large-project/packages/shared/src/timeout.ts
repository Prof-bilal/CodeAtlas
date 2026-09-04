export function timeout<Promise<T>>(...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(message)), ms); promise.then(value => { clearTimeout(timer); resolve(value); }, err => { clearTimeout(timer); reject(err); }); });
}