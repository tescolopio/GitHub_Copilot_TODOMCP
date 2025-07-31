"use strict";
describe('Basic Tests', () => {
    test('project setup should work', () => {
        expect(1 + 1).toBe(2);
    });
    test('environment should be test', () => {
        expect(process.env.NODE_ENV).toBe('test');
    });
});
//# sourceMappingURL=basic.test.js.map