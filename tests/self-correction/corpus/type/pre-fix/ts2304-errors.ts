/**
 * Synthetic TS2304 Errors - Cannot find name
 * 10 deliberate TS2304 errors for corpus testing
 */

// Error 1: Undefined variable reference
const result1 = unknownVar + 10;

// Error 2: Undefined function call
const result2 = undefinedFunction();

// Error 3: Undefined type usage
const result3: UnknownType = {};

// Error 4: Undefined namespace
const result4 = UnknownNamespace.value;

// Error 5: Undefined enum
const result5 = UnknownEnum.Value;

// Error 6: Missing import (fs)
const content = readFileSync("file.txt");

// Error 7: Missing import (path)
const fullPath = join("dir", "file.ts");

// Error 8: Typo in global
const timestamp = Datte.now();

// Error 9: Missing this context
class MyClass {
  getValue() {
    return missingThis;
  }
}

// Error 10: Undefined in arrow function
const fn = () => undefinedInArrow;
