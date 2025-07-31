// Demo file with unused imports for testing removal
import fs from 'fs'; // This will be unused
import path from 'path'; // This will be used
import { useState, useEffect } from 'react'; // useState unused, useEffect used
import * as lodash from 'lodash'; // This will be unused
import './styles.css'; // Side-effect import - should not be removed

class FileProcessor {
  private basePath: string;
  
  constructor() {
    this.basePath = path.join(__dirname, 'files');
  }
  
  process() {
    useEffect(() => {
      console.log('Component mounted');
    }, []);
    
    console.log('Processing files in:', this.basePath);
  }
}

export { FileProcessor };
