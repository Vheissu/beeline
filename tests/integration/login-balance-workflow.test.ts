import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Login from '@/commands/login';
import Balance from '@/commands/balance';
import { KeyManager } from '@/utils/crypto';
import { HiveClient } from '@/utils/hive';
import inquirer from 'inquirer';

// Mock dependencies
jest.mock('@/utils/crypto');
jest.mock('@/utils/hive');
jest.mock('inquirer');
jest.mock('@/utils/neon', () => ({
  neonChalk: {
    glow: jest.fn().mockImplementation((text: string) => text),
    highlight: jest.fn().mockImplementation((text: string) => text),
    warning: jest.fn().mockImplementation((text: string) => text),
    info: jest.fn().mockImplementation((text: string) => text),
    error: jest.fn().mockImplementation((text: string) => text),
    success: jest.fn().mockImplementation((text: string) => text),
    cyan: jest.fn().mockImplementation((text: string) => text),
    magenta: jest.fn().mockImplementation((text: string) => text),
    electric: jest.fn().mockImplementation((text: string) => text),
    white: jest.fn().mockImplementation((text: string) => text),
    darkCyan: jest.fn().mockImplementation((text: string) => text),
    pulse: jest.fn().mockImplementation((text: string) => text),
    accent: jest.fn().mockImplementation((text: string) => text)
  },
  createNeonBox: jest.fn().mockImplementation((content: string, title?: string) => 
    `[BOX: ${title || 'NO_TITLE'}]\n${content}\n[/BOX]`
  ),
  neonSymbols: {
    diamond: '◆',
    cross: '✖',
    check: '✔',
    warning: '⚠',
    star: '★',
    arrow: '→',
    bullet: '▶'
  },
  neonSpinner: jest.fn().mockReturnValue(123),
  stopSpinner: jest.fn(),
  // @ts-ignore
  createNeonBanner: jest.fn().mockResolvedValue('ASCII BANNER'),
  createNeonGrid: jest.fn().mockReturnValue('GRID PATTERN')
}));

describe('Login -> Balance Workflow Integration', () => {
  let mockKeyManager: any;
  let mockHiveClient: any;
  const mockInquirer = jest.mocked(inquirer);

  const testAccount = 'testuser';
  const testPassword = 'testpassword123';
  const testPin = '1234';

  const mockBalances = {
    hive: '1000.000',
    hbd: '100.000',
    hp: '5000.000',
    savings_hive: '50.000',
    savings_hbd: '25.000'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock KeyManager with state persistence
    let accounts: string[] = [];
    let defaultAccount: string | undefined;

    mockKeyManager = {
      // @ts-ignore
      initialize: jest.fn().mockResolvedValue(undefined),
      listAccounts: jest.fn().mockImplementation(() => Promise.resolve([...accounts])),
      hasAccount: jest.fn().mockImplementation((account: string) => 
        Promise.resolve(accounts.includes(account))
      ),
      loginWithPassword: jest.fn().mockImplementation((account: string) => {
        if (!accounts.includes(account)) {
          accounts.push(account);
        }
        if (!defaultAccount) {
          defaultAccount = account;
        }
        return Promise.resolve();
      }),
      getDefaultAccount: jest.fn().mockImplementation(() => defaultAccount),
      // @ts-ignore
      getAccountSummary: jest.fn().mockResolvedValue({
        account: testAccount,
        keyCount: 3,
        roles: ['posting', 'active', 'memo'],
        isDefault: true
      }),
      scrubMemory: jest.fn()
    };

    jest.mocked(KeyManager).mockImplementation(() => mockKeyManager);

    // Mock HiveClient
    mockHiveClient = {
      // @ts-ignore
      getAccount: jest.fn().mockResolvedValue({
        name: testAccount,
        balance: '1000.000 HIVE'
      }),
      // @ts-ignore
      getBalance: jest.fn().mockResolvedValue(mockBalances),
      // @ts-ignore
      getNodeInfo: jest.fn().mockResolvedValue({
        url: 'https://api.hive.blog',
        version: '1.26.4',
        lastBlockNum: 75000000
      })
    };

    jest.mocked(HiveClient).mockImplementation(() => mockHiveClient);

    // Mock inquirer
    // @ts-ignore
    mockInquirer.prompt = jest.fn().mockResolvedValue({
      password: testPassword,
      pin: testPin
    });

    // Mock console and process
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'clear').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      if (typeof fn === 'function') fn();
      return 1 as any;
    });
    const originalStringify = JSON.stringify;
    jest.spyOn(JSON, 'stringify').mockImplementation((obj, replacer, space) => {
      // Create a realistic JSON string that includes the mock property
      if (obj && typeof obj === 'object' && 'mock' in obj) {
        return originalStringify({...obj, mock: true}, replacer, space);
      }
      return originalStringify(obj, replacer, space);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete workflow: login then check balance', () => {
    it('should login and then check balance using default account', async () => {
      // Step 1: Login
      const loginCommand = new Login([], {} as any);
      const loginArgs = { account: testAccount };
      const loginFlags = { roles: 'posting,active', pin: true, verify: true, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: loginArgs, 
        flags: loginFlags 
      });

      await loginCommand.run();

      // Verify login was successful
      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        testPin,
        ['posting', 'active']
      );

      // Step 2: Check balance using default account (no account specified)
      const balanceCommand = new Balance([], {} as any);
      const balanceArgs = { account: undefined }; // Use default account
      const balanceFlags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: balanceArgs,
        flags: balanceFlags
      });

      await balanceCommand.run();

      // Verify balance was fetched for the logged-in account
      expect(mockKeyManager.getDefaultAccount).toHaveBeenCalled();
      expect(mockHiveClient.getBalance).toHaveBeenCalledWith(testAccount);
    });

    it('should handle first-time user workflow', async () => {
      // Simulate first-time user (no existing accounts)
      mockKeyManager.listAccounts.mockResolvedValueOnce([]);

      // Step 1: Login as first-time user
      const loginCommand = new Login([], {} as any);
      const loginArgs = { account: testAccount };
      const loginFlags = { roles: 'posting,active,memo', pin: true, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: loginArgs, 
        flags: loginFlags 
      });

      await loginCommand.run();

      // Should show welcome sequence for first-time user
      expect(console.clear).toHaveBeenCalled();

      // Step 2: Check balance
      const balanceCommand = new Balance([], {} as any);
      const balanceArgs = { account: undefined };
      const balanceFlags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: balanceArgs,
        flags: balanceFlags
      });

      await balanceCommand.run();

      expect(mockHiveClient.getBalance).toHaveBeenCalledWith(testAccount);
    });

    it('should handle multiple account login and balance checking', async () => {
      const secondAccount = 'seconduser';

      // Step 1: Login first account
      const loginCommand1 = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand1, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting', pin: false, verify: false, force: false }
      });

      await loginCommand1.run();

      // Step 2: Login second account
      const loginCommand2 = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand2, 'parse').mockResolvedValue({ 
        args: { account: secondAccount }, 
        flags: { roles: 'posting', pin: false, verify: false, force: false }
      });

      // Mock the account already exists prompt
      mockInquirer.prompt.mockResolvedValueOnce({ password: testPassword });

      await loginCommand2.run();

      // Step 3: Check balance for specific account
      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: secondAccount },
        flags: { format: 'table', mock: false }
      });

      await balanceCommand.run();

      expect(mockHiveClient.getBalance).toHaveBeenCalledWith(secondAccount);
    });
  });

  describe('Error handling in workflow', () => {
    it('should handle login failure and prevent balance check', async () => {
      // Step 1: Attempt login with failure
      const loginCommand = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting', pin: false, verify: false, force: false }
      });

      mockKeyManager.loginWithPassword.mockRejectedValue(new Error('Invalid password'));

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Login failed')
      );

      // Step 2: Try to check balance with no logged-in account
      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'table', mock: false }
      });

      mockKeyManager.getDefaultAccount.mockReturnValue(undefined);

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No account specified and no default account set')
      );
      expect(mockHiveClient.getBalance).not.toHaveBeenCalled();
    });

    it('should handle blockchain connectivity issues during balance check', async () => {
      // Step 1: Successful login
      const loginCommand = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting', pin: false, verify: false, force: false }
      });

      await loginCommand.run();

      // Step 2: Balance check with network error
      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'table', mock: false }
      });

      mockHiveClient.getBalance.mockRejectedValue(new Error('Network timeout'));

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch balance: Network timeout')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Try using mock data')
      );
    });
  });

  describe('Mock mode integration', () => {
    it('should use mock mode for safe testing after login', async () => {
      // Step 1: Login
      const loginCommand = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting', pin: false, verify: false, force: false }
      });

      await loginCommand.run();

      // Step 2: Check balance in mock mode
      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'table', mock: true }
      });

      await balanceCommand.run();

      // Should not call actual blockchain APIs
      expect(mockHiveClient.getBalance).not.toHaveBeenCalled();
      expect(mockHiveClient.getNodeInfo).not.toHaveBeenCalled();

      // Should display mock warning
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Mock data displayed')
      );
    });
  });

  describe('Data consistency across commands', () => {
    it('should maintain account state between login and balance commands', async () => {
      // Step 1: Login
      const loginCommand = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting,active,memo', pin: true, verify: false, force: false }
      });

      await loginCommand.run();

      // Verify account was set as default
      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        testPin,
        ['posting', 'active', 'memo']
      );

      // Step 2: Check that the same KeyManager instance is used
      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'table', mock: false }
      });

      await balanceCommand.run();

      // Should use the same KeyManager instance
      expect(KeyManager).toHaveBeenCalledTimes(2); // Once for login, once for balance
      expect(mockKeyManager.initialize).toHaveBeenCalledTimes(2);
      expect(mockKeyManager.getDefaultAccount).toHaveBeenCalled();
    });

    it('should handle JSON format consistency', async () => {
      // Login and then get balance in JSON format
      const loginCommand = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting', pin: false, verify: false, force: false }
      });

      await loginCommand.run();

      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: testAccount },
        flags: { format: 'json', mock: false }
      });

      jest.spyOn(JSON, 'stringify').mockImplementation((obj) => JSON.stringify(obj));

      await balanceCommand.run();

      expect(JSON.stringify).toHaveBeenCalledWith(
        expect.objectContaining({
          account: testAccount,
          balances: mockBalances,
          node: 'https://api.hive.blog',
          last_block: 75000000,
          timestamp: expect.any(String)
        }),
        null,
        2
      );
    });
  });

  describe('Security integration', () => {
    it('should scrub sensitive data across the workflow', async () => {
      // Step 1: Login with PIN
      const loginCommand = new Login([], {} as any);
      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ 
        args: { account: testAccount }, 
        flags: { roles: 'posting', pin: true, verify: false, force: false }
      });

      await loginCommand.run();

      // Should scrub password and PIN after login
      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPassword);
      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPin);

      // Step 2: Balance check should not expose sensitive data
      const balanceCommand = new Balance([], {} as any);
      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'json', mock: false }
      });

      await balanceCommand.run();

      // Balance output should not contain sensitive information
      const jsonCalls = jest.mocked(JSON.stringify).mock.calls;
      jsonCalls.forEach(call => {
        const jsonString = JSON.stringify(call[0]);
        expect(jsonString).not.toContain(testPassword);
        expect(jsonString).not.toContain(testPin);
      });
    });
  });
});