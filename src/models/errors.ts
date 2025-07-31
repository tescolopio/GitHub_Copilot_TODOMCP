/**
 * @file Defines the error hierarchy for the application.
 * This allows for more specific error handling and recovery strategies.
 * Differentiating between recoverable and fatal errors is key to the
 * stability of the autonomous operation.
 */

/**
 * Base class for custom application errors.
 */
export class AppError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        if (typeof (Error as any).captureStackTrace === 'function') {
            (Error as any).captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Represents an error that is recoverable, allowing the operation to be retried.
 * e.g., temporary network issues, file locks.
 */
export class RecoverableError extends AppError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Represents a fatal error that should stop the current session.
 * e.g., critical configuration issues, unrecoverable state.
 */
export class FatalError extends AppError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Error for invalid configuration that prevents the server from running correctly.
 */
export class ConfigurationError extends FatalError {
    constructor(message: string) {
        super(`Configuration Error: ${message}`);
    }
}

/**
 * Error during a file system operation. Can be recoverable.
 */
export class FileSystemError extends RecoverableError {
    constructor(message: string, public path?: string) {
        super(`File System Error: ${message}` + (path ? ` at ${path}` : ''));
    }
}

/**
 * Error from a Git operation. Can be recoverable.
 */
export class GitError extends RecoverableError {
    constructor(message: string) {
        super(`Git Error: ${message}`);
    }
}

/**
 * Error when a validation check fails (e.g., linting, tests).
 * Not typically recoverable for the same action, but the session may continue.
 */
export class ValidationError extends AppError {
    constructor(message: string) {
        super(`Validation Error: ${message}`);
    }
}
