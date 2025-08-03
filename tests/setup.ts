import '@jest/globals';

// Global test setup for Jest
// Setup any global mocks or configurations here

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to silence console in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set up test environment
process.env.NODE_ENV = 'test';