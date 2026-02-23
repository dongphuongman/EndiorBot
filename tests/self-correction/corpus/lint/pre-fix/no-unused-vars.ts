/**
 * Synthetic no-unused-vars Errors
 * 10 deliberate ESLint no-unused-vars errors
 */

// Error 1: Unused variable declaration
const unusedConstant = "never used";

// Error 2: Unused let variable
let unusedLet = 42;

// Error 3: Unused function
function unusedFunction(): void {
  console.log("never called");
}

// Error 4: Unused parameter
function process(data: string, unused: number): string {
  return data;
}

// Error 5: Unused class
class UnusedClass {
  doSomething(): void {
    console.log("method");
  }
}

// Error 6: Unused import-like variable
const importedModule = { helper: () => {} };

// Error 7: Unused type alias
type UnusedType = string | number;

// Error 8: Unused interface
interface UnusedInterface {
  value: string;
}

// Error 9: Unused enum
enum UnusedEnum {
  VALUE_A,
  VALUE_B,
}

// Error 10: Unused destructured
const { used, notUsed } = { used: 1, notUsed: 2 };

export function main(): number {
  return process("test", 1).length + used;
}
