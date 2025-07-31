#!/usr/bin/env node

/**
 * Comprehensive Demo Script for MCP Autonomous Development System
 * 
 * This script demonstrates the enhanced AST-based tools and their integration:
 * 1. Remove Unused Imports
 * 2. Remove Unused Variables  
 * 3. Enhanced Function Implementation
 * 4. Cross-tool workflows
 */

const { FileSystemTools } = require('./dist/tools/FileSystemTools');
const fs = require('fs-extra');
const path = require('path');

async function createDemoFile() {
  const demoCode = `import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, filter, catchError } from 'rxjs/operators';
import * as lodash from 'lodash';
import { moment } from 'moment';
import { uuid } from 'uuid';

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  averageAge: number;
}

@Component({
  selector: 'app-user-manager',
  template: \`
    <div class="user-manager">
      <h2>{{title}}</h2>
      <div *ngFor="let user of users$ | async">
        {{user.name}} - {{user.email}}
      </div>
    </div>
  \`
})
export class UserManagerComponent implements OnInit {
  @Input() title: string = 'User Management';
  @Output() userSelected = new EventEmitter<User>();
  
  private users: User[] = [];
  private currentUser: User | null = null;
  private isLoading = false;
  private unusedField = 'this will be removed';
  private anotherUnusedField = 42;
  
  public users$ = new BehaviorSubject<User[]>([]);
  
  constructor(private http: HttpClient) {}
  
  ngOnInit() {
    const unusedVariable = 'not used anywhere';
    const tempData = this.loadInitialData();
    this.initializeComponent();
  }
  
  // TODO: Implement user data loading
  loadUsers(): Observable<User[]> {
    // TODO: Implementation needed
  }
  
  // TODO: Implement user creation
  createUser(userData: Partial<User>): Observable<User> {
    // TODO: Implementation needed  
  }
  
  // TODO: Implement user validation
  validateUser(user: User): boolean {
    // TODO: Implementation needed
  }
  
  // TODO: Implement current user getter
  getCurrentUser(): User | null {
    // TODO: Implementation needed
  }
  
  // TODO: Implement user count getter
  getUserCount(): number {
    // TODO: Implementation needed
  }
  
  // TODO: Implement user statistics calculation
  calculateUserStats(): UserStats {
    // TODO: Implementation needed
  }
  
  // TODO: Implement user search functionality
  searchUsers(query: string): Observable<User[]> {
    // TODO: Implementation needed
  }
  
  // TODO: Implement user deletion
  deleteUser(userId: string): Observable<void> {
    // TODO: Implementation needed
  }
  
  private loadInitialData(): void {
    const unusedLocalVar = 'also unused';
    console.log('Loading initial data...');
  }
  
  private initializeComponent(): void {
    this.isLoading = true;
    this.loadUsers().subscribe(users => {
      this.users = users;
      this.users$.next(users);
      this.isLoading = false;
    });
  }
  
  private processUserData(users: User[]): User[] {
    const filteredUsers = users.filter(user => user.email);
    return filteredUsers;
  }
}`;

  const demoPath = path.join(__dirname, 'demo-comprehensive.ts');
  await fs.writeFile(demoPath, demoCode);
  return demoPath;
}

async function runDemo() {
  console.log('🚀 MCP Autonomous Development System - Comprehensive Demo\n');
  
  try {
    const fileSystemTools = new FileSystemTools();
    const demoPath = await createDemoFile();
    
    console.log('📁 Created demo file with:', {
      imports: '8 imports (3 unused)',
      variables: '5+ unused variables',
      functions: '8 TODO function stubs',
      patterns: 'Angular component with TypeScript'
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Remove Unused Imports');
    console.log('='.repeat(60));
    
    const importResult = await fileSystemTools.removeUnusedImports({
      filePath: demoPath,
      dryRun: false
    });
    
    console.log('✅ Unused imports removed:');
    console.log(importResult.content[0].text);
    
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: Remove Unused Variables');
    console.log('='.repeat(60));
    
    const variableResult = await fileSystemTools.removeUnusedVariables({
      filePath: demoPath,
      createBackup: false,
      safeOnly: true
    });
    
    console.log('✅ Unused variables removed:');
    console.log(variableResult.content[0].text);
    
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Enhanced Function Implementation');
    console.log('='.repeat(60));
    
    const functions = [
      'getCurrentUser',
      'getUserCount', 
      'validateUser',
      'loadUsers',
      'createUser'
    ];
    
    for (const functionName of functions) {
      console.log(`\\n🔧 Implementing: ${functionName}`);
      
      const functionResult = await fileSystemTools.implementFunction({
        filePath: demoPath,
        functionName: functionName,
        strategy: 'balanced'
      });
      
      console.log(functionResult.content[0].text);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Final Result Analysis');
    console.log('='.repeat(60));
    
    const finalCode = await fs.readFile(demoPath, 'utf-8');
    const lines = finalCode.split('\\n');
    
    console.log('📊 Final Statistics:');
    console.log({
      totalLines: lines.length,
      todoComments: lines.filter(line => line.includes('TODO')).length,
      implementations: lines.filter(line => line.includes('return')).length,
      imports: lines.filter(line => line.startsWith('import')).length
    });
    
    console.log('\\n✨ Demo completed successfully!');
    console.log('🔍 Check the generated file at:', path.relative(process.cwd(), demoPath));
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runDemo();
}

module.exports = { runDemo };
