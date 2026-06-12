declare module "bun:test" {
  type TestCallback = () => unknown | Promise<unknown>;

  export function afterEach(callback: TestCallback): void;
  export function describe(name: string, callback: TestCallback): void;
  export function test(name: string, callback: TestCallback): void;
  export function expect(actual: unknown): {
    not: ReturnType<typeof expect>;
    toBe(expected: unknown): void;
    toBeDefined(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeNull(): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(expected: RegExp | string): void;
  };
  export const mock: {
    fn<T extends (...args: never[]) => unknown>(implementation?: T): T;
  };
}
