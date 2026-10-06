declare module "node:test" {
  type TestFn = (name: string, fn: () => void | Promise<void>) => void;
  const test: TestFn;
  export default test;
}

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown): void;
    ok(value: unknown): void;
    deepEqual(actual: unknown, expected: unknown): void;
    match(actual: string, expected: RegExp): void;
    throws(fn: () => unknown, expected?: RegExp): void;
    rejects(promise: Promise<unknown>, expected?: RegExp): Promise<void>;
  };
  export default assert;
}
