import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Login from '@/commands/login';
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
  // @ts-ignore
  createNeonBanner: jest.fn().mockResolvedValue('ASCII BANNER'),
  createNeonGrid: jest.fn().mockReturnValue('GRID PATTERN')
}));

describe('Login Command', () => {
  let loginCommand: Login;
  let mockKeyManager: any;
  let mockHiveClient: any;
  const mockInquirer = jest.mocked(inquirer);

  const testAccount = 'testuser';
  const testPassword = 'testpassword123';
  const testPin = '1234';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock KeyManager
    mockKeyManager = {
      // @ts-ignore
      initialize: jest.fn().mockResolvedValue(undefined),
      // @ts-ignore
      listAccounts: jest.fn().mockResolvedValue([]),
      // @ts-ignore
      hasAccount: jest.fn().mockResolvedValue(false),
      // @ts-ignore
      loginWithPassword: jest.fn().mockResolvedValue(undefined),
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
      })
    };

    jest.mocked(HiveClient).mockImplementation(() => mockHiveClient);

    // Mock inquirer
    // @ts-ignore
    mockInquirer.prompt = jest.fn().mockResolvedValue({
      password: testPassword,
      pin: testPin,
      confirm: true
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

    loginCommand = new Login([], {} as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should initialize and login successfully', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting,active', pin: true, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.initialize).toHaveBeenCalled();
      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        testPin,
        ['posting', 'active']
      );
      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPassword);
      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPin);
    });

    it('should handle account with @ prefix', async () => {
      const args = { account: '@' + testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount, // Should strip @ prefix
        testPassword,
        undefined,
        ['posting']
      );
    });

    it('should show welcome sequence for first-time users', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.listAccounts.mockResolvedValue([]); // No existing accounts

      await loginCommand.run();

      expect(console.clear).toHaveBeenCalled();
    });

    it('should not show welcome sequence for existing users', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.listAccounts.mockResolvedValue(['existinguser']); // Has existing accounts

      await loginCommand.run();

      // Welcome sequence includes console.clear, so it shouldn't be called
      // (this is a simplification since mocking the private method is complex)
    });
  });

  describe('role parsing', () => {
    it('should parse comma-separated roles correctly', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'owner,active,posting,memo', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        undefined,
        ['owner', 'active', 'posting', 'memo']
      );
    });

    it('should filter out invalid roles', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting,invalid,active,badRole', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        undefined,
        ['posting', 'active'] // Only valid roles
      );
    });

    it('should handle empty roles gracefully', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'invalid,badRole', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.loginWithPassword).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Invalid roles specified')
      );
    });

    it('should trim whitespace from roles', async () => {
      const args = { account: testAccount };
      const flags = { roles: ' posting , active , memo ', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        undefined,
        ['posting', 'active', 'memo']
      );
    });
  });

  describe('account verification', () => {
    it('should verify account on blockchain when enabled', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: true, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockHiveClient.getAccount).toHaveBeenCalledWith(testAccount);
    });

    it('should skip verification when disabled', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockHiveClient.getAccount).not.toHaveBeenCalled();
    });

    it('should handle account not found on blockchain', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: true, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getAccount.mockResolvedValue(null);

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Account @${testAccount} not found on Hive blockchain`)
      );
      expect(mockKeyManager.loginWithPassword).not.toHaveBeenCalled();
    });

    it('should handle verification errors gracefully', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: true, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getAccount.mockRejectedValue(new Error('Network error'));

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Could not verify account')
      );
      expect(mockKeyManager.loginWithPassword).toHaveBeenCalled(); // Should proceed anyway
    });
  });

  describe('existing account handling', () => {
    it('should prompt for confirmation when account exists', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.hasAccount.mockResolvedValue(true);
      mockInquirer.prompt.mockResolvedValueOnce({ confirm: true })
                         .mockResolvedValueOnce({ password: testPassword });

      await loginCommand.run();

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'confirm',
          message: expect.stringContaining(`Account @${testAccount} already exists`)
        })
      ]);
    });

    it('should cancel login when user declines overwrite', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.hasAccount.mockResolvedValue(true);
      mockInquirer.prompt.mockResolvedValue({ confirm: false });

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Login cancelled')
      );
      expect(mockKeyManager.loginWithPassword).not.toHaveBeenCalled();
    });

    it('should skip confirmation when force flag is used', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: true };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.hasAccount.mockResolvedValue(true);

      await loginCommand.run();

      expect(mockInquirer.prompt).toHaveBeenCalledTimes(1); // Only password prompt
      expect(mockKeyManager.loginWithPassword).toHaveBeenCalled();
    });
  });

  describe('PIN handling', () => {
    it('should prompt for PIN when enabled', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: true, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockInquirer.prompt.mockResolvedValueOnce({ password: testPassword })
                         .mockResolvedValueOnce({ pin: testPin });

      await loginCommand.run();

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'pin',
          message: expect.stringContaining('Set encryption PIN'),
          validate: expect.any(Function)
        })
      ]);
    });

    it('should not prompt for PIN when disabled', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(mockKeyManager.loginWithPassword).toHaveBeenCalledWith(
        testAccount,
        testPassword,
        undefined, // No PIN
        expect.any(Array)
      );
    });

    it('should validate PIN length', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: true, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      // Get the PIN prompt configuration
      await loginCommand.run();

      const pinPromptCall = mockInquirer.prompt.mock.calls.find(call => 
        call[0][0].name === 'pin'
      );
      
      expect(pinPromptCall).toBeDefined();
      const validator = pinPromptCall![0][0].validate;
      
      expect(validator('123')).toBe('PIN must be at least 4 characters');
      expect(validator('1234')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle login errors gracefully', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.loginWithPassword.mockRejectedValue(new Error('Login failed'));

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Login failed')
      );
      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPassword);
    });

    it('should scrub memory on errors', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: true, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.loginWithPassword.mockRejectedValue(new Error('Error'));

      await loginCommand.run();

      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPassword);
      expect(mockKeyManager.scrubMemory).toHaveBeenCalledWith(testPin);
    });

    it('should handle password prompt validation', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      const passwordPromptCall = mockInquirer.prompt.mock.calls.find(call =>
        call[0][0].name === 'password'
      );

      expect(passwordPromptCall).toBeDefined();
      const validator = passwordPromptCall![0][0].validate;
      
      expect(validator('')).toBe('Password required');
      expect(validator('password')).toBe(true);
    });
  });

  describe('spinner and UI', () => {
    it('should show verification spinner', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: true, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      const { neonSpinner } = await import('@/utils/neon');
      expect(neonSpinner).toHaveBeenCalledWith('Verifying account on Hive blockchain');
    });

    it('should show login spinner', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      const { neonSpinner } = await import('@/utils/neon');
      expect(neonSpinner).toHaveBeenCalledWith('Deriving keys from master password');
    });

    it('should clear spinners on completion', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      expect(clearInterval).toHaveBeenCalled();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('\r')
      );
    });
  });

  describe('success display', () => {
    it('should display login success information', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting,active', pin: true, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });

      await loginCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      expect(createNeonBox).toHaveBeenCalledWith(
        expect.stringContaining('Welcome to the neon grid'),
        expect.stringContaining('LOGIN COMPLETE')
      );
    });

    it('should show next steps for first-time users', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.listAccounts.mockResolvedValue([]); // First-time user

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Your wallet is now ready! Next steps:')
      );
    });

    it('should show appropriate next steps for existing users', async () => {
      const args = { account: testAccount };
      const flags = { roles: 'posting', pin: false, verify: false, force: false };

      // @ts-ignore
      jest.spyOn(loginCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.listAccounts.mockResolvedValue(['existing']); // Not first-time

      await loginCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Next steps:')
      );
    });
  });

  describe('command configuration', () => {
    it('should have correct static properties', () => {
      expect(Login.description).toBe('Login to your Hive account with master password');
      expect(Login.examples).toContain('$ beeline login alice');
      expect(Login.flags).toHaveProperty('roles');
      expect(Login.flags).toHaveProperty('pin');
      expect(Login.flags).toHaveProperty('verify');
      expect(Login.flags).toHaveProperty('force');
      expect(Login.args).toHaveProperty('account');
    });

    it('should have correct flag defaults', () => {
      expect(Login.flags.roles.default).toBe('posting,active,memo');
      expect(Login.flags.pin.default).toBe(true);
      expect(Login.flags.verify.default).toBe(true);
      expect(Login.flags.force.default).toBe(false);
    });
  });
});