export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends object ? DeepMutable<T[P]> : T[P];
};

export type PickByType<T, U> = {
  [K in keyof T as T[K] extends U ? K : never]: T[K];
};

export type OmitByType<T, U> = {
  [K in keyof T as T[K] extends U ? never : K]: T[K];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

export type RequireExactlyOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>> }[Keys];

export type OptionalExcept<T, Keys extends keyof T> = Omit<T, Keys> & Partial<Pick<T, Keys>>;

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type Maybe<T> = T | null | undefined;

export type NonOptional<T> = Exclude<T, undefined>;

export type NonNullable2<T> = Exclude<T, null | undefined>;

export type ArrayElement<T> = T extends (infer U)[] ? U : never;

export type PromiseValue<T> = T extends Promise<infer U> ? U : T;

export type FunctionParams<T> = T extends (...args: infer P) => unknown ? P : never;

export type FunctionReturn<T> = T extends (...args: unknown[]) => infer R ? R : never;

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

export type ValuesOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? T[K] : never;
}[keyof T];

export type StringKeys<T> = Extract<keyof T, string>;

export type NumberKeys<T> = Extract<keyof T, number>;

export type SymbolKeys<T> = Extract<keyof T, symbol>;

export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsAny<T> = 0 extends (1 & T) ? true : false;

export type IsUnknown<T> = IsNever<T> extends false ? T extends unknown ? true : false : false;

export type IsFunction<T> = T extends (...args: unknown[]) => unknown ? true : false;

export type IsArray<T> = T extends unknown[] ? true : false;

export type IsObject<T> = T extends Record<string, unknown> ? true : false;

export type IsPrimitive<T> = T extends string | number | boolean | bigint | symbol | null | undefined ? true : false;

export type Head<T extends unknown[]> = T extends [infer H, ...unknown[]] ? H : never;

export type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;

export type Last<T extends unknown[]> = T extends [...unknown[], infer L] ? L : never;

export type Length<T extends unknown[]> = T['length'];

export type Prepend<T, U extends unknown[]> = [T, ...U];

export type Append<T extends unknown[], U> = [...T, U];

export type Reverse<T extends unknown[]> = T extends [infer H, ...infer R] ? [...Reverse<R>, H] : [];

export type Flatten<T extends unknown[][]> = T extends (infer U)[] ? U : never;

export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type ExtractUnion<T, U> = T extends U ? T : never;

export type ExcludeUnion<T, U> = T extends U ? never : T;

export type Distribute<T, U> = T extends unknown ? U : never;

export type NonEmptyArray<T> = [T, ...T[]];

export type ReadonlyNonEmptyArray<T> = readonly [T, ...T[]];
