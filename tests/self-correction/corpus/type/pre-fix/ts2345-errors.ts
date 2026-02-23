/**
 * Synthetic TS2345 Errors - Argument type mismatch
 * 10 deliberate TS2345 errors for corpus testing
 */

// Helper functions for type errors
function expectNumber(n: number): number {
  return n * 2;
}

function expectString(s: string): string {
  return s.toUpperCase();
}

function expectBoolean(b: boolean): boolean {
  return !b;
}

function expectArray(arr: number[]): number {
  return arr.length;
}

function expectObject(obj: { name: string }): string {
  return obj.name;
}

// Error 1: String passed to number parameter
const result1 = expectNumber("42");

// Error 2: Number passed to string parameter
const result2 = expectString(123);

// Error 3: String passed to boolean parameter
const result3 = expectBoolean("true");

// Error 4: Object passed to array parameter
const result4 = expectArray({ length: 5 });

// Error 5: Array passed to object parameter
const result5 = expectObject(["name"]);

// Error 6: Null passed to non-nullable
const result6 = expectNumber(null);

// Error 7: Undefined passed to non-nullable
const result7 = expectString(undefined);

// Error 8: Wrong callback signature
const nums = [1, 2, 3];
const mapped = nums.map((n: string) => n.toUpperCase());

// Error 9: Promise to non-promise
async function getValue(): Promise<number> {
  return 42;
}
const result9 = expectNumber(getValue());

// Error 10: Generic type mismatch
function identity<T>(value: T): T {
  return value;
}
const result10: string = identity<number>(42);

export { result1, result2, result3, result4, result5 };
