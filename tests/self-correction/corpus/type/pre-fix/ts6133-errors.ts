/**
 * Synthetic TS6133 Errors - Declared but never read
 * 10 deliberate TS6133 errors for corpus testing
 */

// Error 1: Unused variable
const unusedVar = 42;

// Error 2: Unused function parameter
function processData(used: string, unused: number): string {
  return used.toUpperCase();
}

// Error 3: Unused import (simulated)
// import { unusedImport } from "./module";

// Error 4: Unused destructured variable
const { active, inactive } = { active: true, inactive: false };
console.log(active);

// Error 5: Unused array destructure
const [first, second, third] = [1, 2, 3];
console.log(first);

// Error 6: Unused catch parameter
try {
  throw new Error("test");
} catch (error) {
  console.log("Error occurred");
}

// Error 7: Unused loop variable
for (const item of [1, 2, 3]) {
  console.log("Processing");
}

// Error 8: Unused function declaration
function unusedHelper(): void {
  console.log("never called");
}

// Error 9: Unused type parameter
interface Container<T, U> {
  value: T;
}

// Error 10: Unused class property
class Example {
  private unusedProp = "value";

  public getValue(): string {
    return "fixed";
  }
}

export { processData };
