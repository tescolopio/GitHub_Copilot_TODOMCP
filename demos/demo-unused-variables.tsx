// Demo file for testing unused variable removal
// This file intentionally contains unused variables for testing the AST-based cleanup tools

import { useState, useEffect } from 'react';

function DemoComponent() {
  // Used variables
  const [count, setCount] = useState(0);
  const validData = { name: 'test', value: 42 };

  // Unused variables - these should be detected and removed by our tools
  const unusedString = 'this variable is not used';
  const unusedNumber = 42;
  const unusedObject = { key: 'value', nested: { data: 'test' } };

  useEffect(() => {
    // Effect logic here
    console.log('Component mounted');
  }, []);

  // Function with unused parameters (parameters prefixed with _ are intentionally unused)
  function processData(data, _unusedParam, _anotherUnused) {
    return data.name;
  }

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <p>Valid data: {validData.name}</p>
      <p>Processed: {processData(validData, 'unused', 'also unused')}</p>
    </div>
  );
}

// Global unused variables for testing
const globalUnused = 'this should be detected as unused';
const anotherGlobalUnused = { key: 'value' };

// Unused function at module level
function unusedModuleFunction() {
  return 'I am unused';
}

// Used function
function usedFunction() {
  return 'this is used';
}

export default DemoComponent;
export { usedFunction };
