export type Subscriber<T> = (value: T) => void;
export type Unsubscribe = () => void;

export interface Observable<T> {
  subscribe: (subscriber: Subscriber<T>) => Unsubscribe;
  getValue: () => T;
}

export function createObservable<T>(initialValue: T): {
  observable: Observable<T>;
  setValue: (value: T | ((prev: T) => T)) => void;
} {
  let value = initialValue;
  const subscribers = new Set<Subscriber<T>>();

  const observable: Observable<T> = {
    subscribe: (subscriber: Subscriber<T>) => {
      subscribers.add(subscriber);
      subscriber(value);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    getValue: () => value,
  };

  function setValue(newValue: T | ((prev: T) => T)): void {
    value = typeof newValue === 'function' ? (newValue as (prev: T) => T)(value) : newValue;
    subscribers.forEach(subscriber => subscriber(value));
  }

  return { observable, setValue };
}

export function combineObservables<T extends Observable<unknown>[]>(
  ...observables: T
): Observable<{ [K in keyof T]: T[K] extends Observable<infer V> ? V : never }> {
  return {
    subscribe: (subscriber) => {
      const values = observables.map(o => o.getValue()) as { [K in keyof T]: T[K] extends Observable<infer V> ? V : never };
      const unsubscribes = observables.map((observable, index) =>
        observable.subscribe((value) => {
          (values as unknown[])[index] = value;
          subscriber(values);
        })
      );
      subscriber(values);
      return () => unsubscribes.forEach(unsub => unsub());
    },
    getValue: () => observables.map(o => o.getValue()) as { [K in keyof T]: T[K] extends Observable<infer V> ? V : never },
  };
}

export function mapObservable<T, U>(observable: Observable<T>, fn: (value: T) => U): Observable<U> {
  return {
    subscribe: (subscriber) => {
      return observable.subscribe((value) => subscriber(fn(value)));
    },
    getValue: () => fn(observable.getValue()),
  };
}

export function filterObservable<T>(observable: Observable<T>, predicate: (value: T) => boolean): Observable<T> {
  let lastValue = observable.getValue();
  return {
    subscribe: (subscriber) => {
      return observable.subscribe((value) => {
        if (predicate(value)) {
          lastValue = value;
          subscriber(value);
        }
      });
    },
    getValue: () => lastValue,
  };
}

export function distinctUntilChanged<T>(observable: Observable<T>, equals?: (a: T, b: T) => boolean): Observable<T> {
  const compare = equals || ((a, b) => a === b);
  let lastValue: T;
  let initialized = false;
  return {
    subscribe: (subscriber) => {
      return observable.subscribe((value) => {
        if (!initialized || !compare(lastValue, value)) {
          lastValue = value;
          initialized = true;
          subscriber(value);
        }
      });
    },
    getValue: () => lastValue,
  };
}
