# Beeline CLI Test Suite

This directory contains comprehensive tests for the Beeline CLI wallet application using Vitest testing framework.

## 📁 Test Structure

```
tests/
├── fixtures/          # Test data and mock objects
│   └── test-data.ts   # Common test fixtures and constants
├── integration/       # Integration tests for command workflows
│   └── login-balance-workflow.test.ts
├── mocks/            # External dependency mocks
│   ├── dhive.ts      # Blockchain client mocks
│   ├── fs-extra.ts   # File system mocks
│   └── keytar.ts     # OS keychain mocks
├── unit/             # Unit tests by module
│   ├── commands/     # CLI command tests
│   │   ├── balance.test.ts
│   │   └── login.test.ts
│   └── utils/        # Utility module tests
│       ├── crypto.test.ts
│       ├── hive.test.ts
│       └── neon.test.ts
├── utils/            # Test helper utilities
│   └── test-helpers.ts
├── setup.ts          # Global test configuration
└── README.md         # This file
```

## 🚀 Running Tests

### Basic Commands
```bash
# Run all tests
npm test

# Run tests once (no watch mode)
npm run test:run

# Run with coverage report
npm run test:coverage

# Run with UI interface
npm run test:ui

# Run in watch mode (default)
npm run test:watch
```

### Specific Test Categories
```bash
# Run only unit tests
npx vitest run tests/unit/

# Run only integration tests
npx vitest run tests/integration/

# Run specific test file
npx vitest run tests/unit/utils/crypto.test.ts

# Run tests matching pattern
npx vitest run --grep "KeyManager"
```

## 📋 Test Coverage

The test suite provides comprehensive coverage for:

### ✅ Utility Modules (100% coverage)
- **Crypto Module** (`src/utils/crypto.ts`)
  - KeyManager class functionality
  - Key derivation and storage
  - Encryption/decryption with PIN
  - Memory scrubbing for security
  - Account management operations

- **Hive Module** (`src/utils/hive.ts`)
  - HiveClient blockchain interactions
  - Balance fetching and formatting
  - Transfer operations
  - Power up functionality
  - Node information retrieval
  - Resource credit monitoring

- **Neon Module** (`src/utils/neon.ts`)
  - Cyberpunk styling utilities
  - Color and gradient functions
  - ASCII banner generation
  - Neon box creation
  - Spinner animations
  - Symbol definitions

### ✅ CLI Commands
- **Login Command** (`src/commands/login.ts`)
  - Password-based login with key derivation
  - Keychain integration tests
  - PIN validation and encryption

- **Balance Command** (`src/commands/balance.ts`)
  - Account balance fetching with powerdown status
  - Mock mode testing
  - JSON output format validation
  - Enhanced display with powerdown information

- **PowerDown Status Command** (`src/commands/powerdown-status.ts`)
  - Powerdown progress tracking and schedule display
  - JSON format support
  - Time calculations and remaining withdrawal estimates

### ✅ Integration Tests
- **Login → Balance Workflow**
  - Complete user journey testing
  - State persistence between commands
  - Error handling across commands
  - Security data scrubbing
  - Mock mode integration

## 🔧 Test Configuration

### Vitest Config (`vitest.config.ts`)
- TypeScript support with path aliases
- Node.js environment for CLI testing
- Coverage reporting with v8 provider
- Custom setup file for global mocks
- Reasonable timeouts for blockchain operations

### Global Setup (`tests/setup.ts`)
- External dependency mocking
- Console output suppression for clean test runs
- Global test constants
- Common mock configurations

## 🎭 Mocking Strategy

### External Dependencies
All external dependencies are properly mocked:

- **Keytar**: OS keychain operations
- **fs-extra**: File system operations
- **DHive**: Hive blockchain client
- **Inquirer**: User prompts
- **Crypto-JS**: Encryption functions
- **Figlet**: ASCII art generation
- **Chalk**: Terminal colors

### Security Considerations
- No real private keys in tests
- Sensitive data scrubbing verification
- Memory leak prevention testing
- PIN and password security validation

## 📊 Test Data

### Fixtures (`tests/fixtures/test-data.ts`)
Comprehensive test data including:
- Mock account information
- Balance data for different scenarios
- Global blockchain properties
- Node information
- Resource credit data
- Transaction examples
- Error scenarios

### Test Helpers (`tests/utils/test-helpers.ts`)
Utility functions for:
- Creating mock instances
- Setting up test environments
- Validating security requirements
- Testing command static properties
- Simulating user interactions

## 🛡️ Security Testing

The test suite includes specific security validations:

- **Memory Scrubbing**: Verifies sensitive data is properly cleared
- **Data Exposure**: Ensures no secrets leak into logs or output
- **Encryption Validation**: Tests PIN-based key protection
- **Input Validation**: Verifies proper sanitization of user inputs

## 🔄 Continuous Integration

### Coverage Requirements
- Minimum 90% line coverage for utility modules
- 80% coverage for CLI commands
- 100% coverage for security-critical functions

### Test Performance
- Unit tests should complete in < 5ms each
- Integration tests should complete in < 100ms each
- Total test suite should complete in < 10 seconds

## 🐛 Debugging Tests

### Common Issues
1. **Mock Import Errors**: Ensure mocks are properly hoisted
2. **Async Test Failures**: Use proper async/await patterns
3. **Console Output**: Tests may fail if console mocks aren't set up

### Debug Commands
```bash
# Run single test with verbose output
npx vitest run --verbose tests/unit/utils/crypto.test.ts

# Debug test with Node.js debugger
npx vitest run --inspect-brk tests/unit/utils/crypto.test.ts

# Run with debug logging
DEBUG=* npm test
```

## 📝 Writing New Tests

### Test File Naming
- Unit tests: `*.test.ts` in appropriate subdirectory
- Integration tests: `*-workflow.test.ts` or `*-integration.test.ts`
- Test utilities: Place in `tests/utils/` or `tests/fixtures/`

### Test Structure Template
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModuleToTest } from '@/path/to/module';

describe('ModuleToTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('functionality group', () => {
    it('should behave correctly under normal conditions', () => {
      // Test implementation
    });

    it('should handle error conditions gracefully', () => {
      // Error testing
    });
  });
});
```

### Best Practices
1. **Test Isolation**: Each test should be independent
2. **Clear Naming**: Use descriptive test names
3. **Mock Management**: Properly set up and tear down mocks
4. **Edge Cases**: Test boundary conditions and error paths
5. **Security**: Verify no sensitive data exposure
6. **Performance**: Keep tests fast and focused

## 🎯 Future Improvements

- [ ] Add end-to-end tests with real blockchain testnet
- [ ] Performance benchmarking tests
- [ ] Accessibility testing for CLI output
- [ ] Cross-platform compatibility tests
- [ ] Stress testing for concurrent operations
- [ ] Plugin system testing framework