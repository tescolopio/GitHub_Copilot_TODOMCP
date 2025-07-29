# Contributing to MCP TODO Management System

Thank you for your interest in contributing to the MCP TODO Management System! We welcome contributions from the community and are excited to work with you.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18.0.0 or higher)
- [pnpm](https://pnpm.io/) package manager
- [Git](https://git-scm.com/)
- Basic knowledge of TypeScript and MCP (Model Context Protocol)

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/GitHub_Copilot_TODOMCP.git
   cd GitHub_Copilot_TODOMCP
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/tescolopio/GitHub_Copilot_TODOMCP.git
   ```
4. **Install dependencies**:
   ```bash
   pnpm install
   ```
5. **Build the project**:
   ```bash
   pnpm build
   ```
6. **Run the tests** to ensure everything is working:
   ```bash
   pnpm test
   ```

## 🛠️ Development Workflow

### Making Changes

1. **Create a new branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes** following our coding standards
3. **Add tests** for your changes
4. **Run the test suite**:
   ```bash
   pnpm test
   ```
5. **Run the linter**:
   ```bash
   pnpm lint
   ```
6. **Build the project** to ensure it compiles:
   ```bash
   pnpm build
   ```

### Code Style and Standards

- **TypeScript**: We use TypeScript with strict type checking
- **ESLint**: Follow the existing ESLint configuration
- **Prettier**: Code formatting is handled by Prettier
- **Testing**: Use Jest for unit tests
- **Logging**: Use the Winston logger from `src/utils/logger`

### Commit Guidelines

We use conventional commits to maintain a clean git history:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Example:

```
feat: add support for custom TODO patterns
fix: resolve session recovery issue
docs: update README with new installation steps
```

## 🧪 Testing

- **Unit Tests**: Write unit tests for new functionality
- **Integration Tests**: Add integration tests for complex features
- **Test Coverage**: Aim for good test coverage on new code
- **Manual Testing**: Test your changes with VS Code and GitHub Copilot

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## 📝 Pull Request Process

1. **Update documentation** if needed
2. **Ensure all tests pass**
3. **Update the CHANGELOG.md** if applicable
4. **Create a pull request** with a clear title and description
5. **Link any related issues** in the PR description
6. **Request review** from maintainers

### Pull Request Template

When creating a pull request, please include:

- **Description**: What does this PR do?
- **Type of Change**: Bug fix, new feature, documentation, etc.
- **Testing**: How was this tested?
- **Checklist**:
  - [ ] Tests pass
  - [ ] Code follows style guidelines
  - [ ] Self-review completed
  - [ ] Documentation updated

## 🐛 Reporting Issues

When reporting issues, please include:

- **Environment**: OS, Node.js version, VS Code version
- **Steps to reproduce** the issue
- **Expected behavior**
- **Actual behavior**
- **Screenshots or logs** if applicable
- **TODO-related context** if the issue involves TODO management

## 💡 Feature Requests

We welcome feature requests! Please:

- **Check existing issues** to avoid duplicates
- **Describe the feature** and its use case
- **Explain how it fits** with the TODO management focus
- **Consider backward compatibility**

## 🏗️ Architecture Guidelines

### MCP Tools

- Follow the existing MCP tool patterns
- Ensure tools are focused on TODO management
- Add proper error handling and logging
- Include comprehensive JSDoc comments

### TODO Management

- Consider different TODO formats and extensions
- Ensure safety checks are in place
- Maintain session state properly
- Follow the autonomous continuation pattern

### VS Code Integration

- Test with GitHub Copilot specifically
- Consider different workspace scenarios
- Ensure proper extension lifecycle management

## 🔒 Security Guidelines

### Handling Sensitive Data

- **Never commit** real credentials, tokens, or API keys
- **Use example files** for configuration templates
- **Test with mock data** instead of real user data
- **Sanitize logs** before including in issues or PRs

### Code Security

- **Validate all inputs** from configuration files
- **Use path sanitization** for file operations
- **Implement proper error handling** without exposing internals
- **Follow principle of least privilege** for file access

### Reporting Security Issues

- **Do not** create public issues for security vulnerabilities
- **Contact maintainers** privately (see SECURITY.md)
- **Wait for patches** before disclosing publicly

## 📚 Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 Community

- Be respectful and inclusive
- Help others learn and grow
- Share knowledge and best practices
- Focus on constructive feedback

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to making GitHub Copilot's TODO management even better! 🚀
