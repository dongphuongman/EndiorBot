/**
 * Synthetic prefer-const Errors
 * 10 deliberate ESLint prefer-const errors
 */

// Error 1: let that is never reassigned
export function example1(): number {
  let value = 42;
  return value;
}

// Error 2: let in function scope
export function example2(): string {
  let message = "hello";
  return message.toUpperCase();
}

// Error 3: let in block scope
export function example3(): number {
  if (true) {
    let result = 100;
    return result;
  }
  return 0;
}

// Error 4: let in loop (not reassigned)
export function example4(): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let increment = 1;
    sum += increment;
  }
  return sum;
}

// Error 5: let with object (not reassigned)
export function example5(): string {
  let config = { name: "test", value: 42 };
  return config.name;
}

// Error 6: let with array (not reassigned)
export function example6(): number {
  let items = [1, 2, 3, 4, 5];
  return items.length;
}

// Error 7: let in arrow function
export const example7 = (): boolean => {
  let flag = true;
  return flag;
};

// Error 8: let destructuring (not reassigned)
export function example8(): number {
  let { x, y } = { x: 10, y: 20 };
  return x + y;
}

// Error 9: let array destructuring
export function example9(): string {
  let [first, second] = ["a", "b"];
  return first + second;
}

// Error 10: let in class method
export class Example {
  getValue(): number {
    let multiplier = 2;
    return 21 * multiplier;
  }
}
