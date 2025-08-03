import { jest } from '@jest/globals';
import { KeyManager } from '@/utils/crypto';
import { HiveClient } from '@/utils/hive';
import inquirer from 'inquirer';
import { 
  TEST_ACCOUNTS, 
  TEST_CREDENTIALS, 
  MOCK_BALANCES, 
  MOCK_NODE_INFO,
  WALLET_CONFIGS
} from '../fixtures/test-data';

/**
 * Test helper utilities for Beeline CLI tests
 */

/**
 * Creates a mock KeyManager with common test scenarios
 */
export function createMockKeyManager(scenario: 'empty' | 'single' | 'multiple' = 'empty') {
  const configs = {
    empty: WALLET_CONFIGS.empty,
    single: WALLET_CONFIGS.singleAccount,
    multiple: WALLET_CONFIGS.multipleAccounts
  };

  const config = configs[scenario];
  const accounts = Object.keys(config.accounts);

  return {
    initialize: jest.fn().mockResolvedValue(undefined),
    saveConfig: jest.fn().mockResolvedValue(undefined),
    listAccounts: jest.fn().mockResolvedValue(accounts),
    hasAccount: jest.fn().mockImplementation((account: string) => 
      Promise.resolve(accounts.includes(account))
    ),
    getDefaultAccount: jest.fn().mockReturnValue(config.defaultAccount),
    setDefaultAccount: jest.fn().mockResolvedValue(undefined),
    loginWithPassword: jest.fn().mockResolvedValue(undefined),
    importPrivateKey: jest.fn().mockResolvedValue(undefined),
    getPrivateKey: jest.fn().mockResolvedValue(TEST_CREDENTIALS.password),
    removeKey: jest.fn().mockResolvedValue(undefined),
    listKeys: jest.fn().mockImplementation((account: string) => 
      Promise.resolve(config.accounts[account] || [])
    ),
    getAccountSummary: jest.fn().mockImplementation((account: string) => {
      const keys = config.accounts[account];
      if (!keys) return Promise.resolve(null);
      
      return Promise.resolve({
        account,
        keyCount: keys.length,
        roles: keys.map(k => k.role),
        isDefault: config.defaultAccount === account
      });
    }),
    getAllAccountSummaries: jest.fn().mockImplementation(() => {
      return Promise.resolve(accounts.map(account => ({
        account,
        keyCount: config.accounts[account].length,
        roles: config.accounts[account].map(k => k.role),
        isDefault: config.defaultAccount === account
      })));
    }),
    deriveKeysFromPassword: jest.fn().mockReturnValue({
      owner: { toString: () => 'mock-owner-key' },
      active: { toString: () => 'mock-active-key' },
      posting: { toString: () => 'mock-posting-key' },
      memo: { toString: () => 'mock-memo-key' }
    }),
    scrubMemory: jest.fn()
  };
}

/**
 * Creates a mock HiveClient with common test scenarios
 */
export function createMockHiveClient(scenario: 'normal' | 'wealthy' | 'empty' | 'error' = 'normal') {
  const balances = {
    normal: MOCK_BALANCES.basic,
    wealthy: MOCK_BALANCES.wealthy,
    empty: MOCK_BALANCES.empty,
    error: null
  };

  const mockClient = {
    getAccount: jest.fn().mockImplementation((username: string) => {
      if (scenario === 'error') {
        return Promise.reject(new Error('Network error'));
      }
      if (username === TEST_ACCOUNTS.nonexistent) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        name: username,
        balance: '1000.000 HIVE'
      });
    }),
    getBalance: jest.fn().mockImplementation((username: string) => {
      if (scenario === 'error') {
        return Promise.reject(new Error('Failed to fetch balance'));
      }
      if (username === TEST_ACCOUNTS.nonexistent) {
        return Promise.reject(new Error(`Account ${username} not found`));
      }
      return Promise.resolve(balances[scenario]);
    }),
    getNodeInfo: jest.fn().mockResolvedValue(MOCK_NODE_INFO.primary),
    getResourceCredits: jest.fn().mockResolvedValue({
      current: 5000000000000,
      max: 10000000000000,
      percentage: 50
    }),
    transfer: jest.fn().mockResolvedValue('mock-transaction-id'),
    powerUp: jest.fn().mockResolvedValue('mock-powerup-id')
  };

  return mockClient;
}

/**
 * Sets up common mocks for CLI commands
 */
export function setupCommandMocks() {
  // Mock console methods
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'clear').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  
  // Mock process methods
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  
  // Mock timing functions
  jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
    if (typeof fn === 'function') fn();
    return 1 as any;
  });
  
  // Mock inquirer with default responses
  const mockInquirer = jest.mocked(inquirer);
  mockInquirer.prompt = jest.fn().mockResolvedValue({
    password: TEST_CREDENTIALS.password,
    pin: TEST_CREDENTIALS.pin,
    confirm: true
  });

  return {
    console: {
      log: console.log,
      clear: console.clear,
      error: console.error
    },
    process: {
      stdout: process.stdout.write,
      stderr: process.stderr.write
    },
    inquirer: mockInquirer.prompt
  };
}

/**
 * Creates a mock OCLIF command parse result
 */
export function createMockParseResult<T, F>(args: T, flags: F) {
  return { args, flags };
}

/**
 * Asserts that sensitive data is not present in output
 */
export function assertNoSensitiveData(output: string | object) {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  
  expect(outputStr).not.toContain(TEST_CREDENTIALS.password);
  expect(outputStr).not.toContain(TEST_CREDENTIALS.pin);
  expect(outputStr).not.toContain('private');
  expect(outputStr).not.toContain('secret');
}

/**
 * Simulates user interaction delays
 */
export async function simulateUserDelay(ms: number = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a mock spinner that can be tested
 */
export function createMockSpinner() {
  const spinnerId = 123;
  const mockSpinner = jest.fn().mockReturnValue(spinnerId);
  
  return {
    create: mockSpinner,
    id: spinnerId,
    clear: () => clearInterval(spinnerId)
  };
}

/**
 * Verifies that memory scrubbing was called for sensitive data
 */
export function assertMemoryScrubbed(mockKeyManager: any, ...sensitiveData: string[]) {
  sensitiveData.forEach(data => {
    expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(data);
  });
}

/**
 * Creates a test environment with all necessary mocks
 */
export function createTestEnvironment(options: {
  keyManagerScenario?: 'empty' | 'single' | 'multiple';
  hiveClientScenario?: 'normal' | 'wealthy' | 'empty' | 'error';
  mockNeon?: boolean;
} = {}) {
  const {
    keyManagerScenario = 'empty',
    hiveClientScenario = 'normal',
    mockNeon = true
  } = options;

  const mockKeyManager = createMockKeyManager(keyManagerScenario);
  const mockHiveClient = createMockHiveClient(hiveClientScenario);
  const commandMocks = setupCommandMocks();

  // Mock dependency modules
  jest.mocked(KeyManager).mockImplementation(() => mockKeyManager as any);
  jest.mocked(HiveClient).mockImplementation(() => mockHiveClient as any);

  if (mockNeon) {
    jest.doMock('@/utils/neon', () => ({
      neonChalk: Object.fromEntries(
        ['glow', 'highlight', 'warning', 'info', 'error', 'success', 'cyan', 'magenta', 'electric', 'white', 'darkCyan', 'pulse', 'accent']
          .map(fn => [fn, jest.fn().mockImplementation((text: string) => text)])
      ),
      createNeonBox: jest.fn().mockImplementation((content: string, title?: string) => 
        `[BOX: ${title || 'NO_TITLE'}]\n${content}\n[/BOX]`
      ),
      neonSymbols: {
        diamond: '◆', cross: '✖', check: '✔', warning: '⚠',
        star: '★', arrow: '→', bullet: '▶'
      },
      neonSpinner: jest.fn().mockReturnValue(123),
      createNeonBanner: jest.fn().mockResolvedValue('ASCII BANNER'),
      createNeonGrid: jest.fn().mockReturnValue('GRID PATTERN')
    }));
  }

  return {
    mockKeyManager,
    mockHiveClient,
    commandMocks,
    cleanup: () => {
      jest.restoreAllMocks();
    }
  };
}

/**
 * Helper to test command static properties
 */
export function testCommandStaticProperties(CommandClass: any, expectedProperties: {
  description?: string;
  examples?: string[];
  flags?: string[];
  args?: string[];
}) {
  if (expectedProperties.description) {
    expect(CommandClass.description).toBe(expectedProperties.description);
  }
  
  if (expectedProperties.examples) {
    expectedProperties.examples.forEach(example => {
      expect(CommandClass.examples).toContain(example);
    });
  }
  
  if (expectedProperties.flags) {
    expectedProperties.flags.forEach(flag => {
      expect(CommandClass.flags).toHaveProperty(flag);
    });
  }
  
  if (expectedProperties.args) {
    expectedProperties.args.forEach(arg => {
      expect(CommandClass.args).toHaveProperty(arg);
    });
  }
}