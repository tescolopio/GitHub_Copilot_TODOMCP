// Sample TypeScript utility functions
export class StringUtils {
t
t
t
t
t
  // TODO: add comment explaining this method
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  // TODO: fix formatting
  static reverse(str:string):string{
    return str.split('').reverse().join('');
  }
  // TODO: update documentation with examples
  static truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.substring(0, maxLength - 3) + '...';
  }
  // TODO: rename camelCase to toCamelCase
  static camelCase(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (match, char) => char.toUpperCase());
  }
}
export class NumberUtils {
  // TODO: add proper error handling
  static factorial(n: number): number {
    if (n < 0) return -1;
    if (n === 0) return 1;
    return n * NumberUtils.factorial(n - 1);
  }
  // TODO: implement proper validation
  static isPrime(n: number): boolean {
    if (n < 2) return false;
    for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) return false;
    }
    return true;
  }
}