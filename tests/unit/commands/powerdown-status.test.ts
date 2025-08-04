import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import PowerDownStatus from '../../../src/commands/powerdown-status';
import { KeyManager } from '../../../src/utils/crypto';
import { HiveClient } from '../../../src/utils/hive';

// Mock external dependencies
jest.mock('../../../src/utils/crypto');
jest.mock('../../../src/utils/hive');
jest.mock('../../../src/utils/neon', () => ({
  neonChalk: {
    glow: jest.fn(text => text),
    warning: jest.fn(text => text),
    error: jest.fn(text => text),
    info: jest.fn(text => text),
    success: jest.fn(text => text),
    white: jest.fn(text => text),
    cyan: jest.fn(text => text),
    magenta: jest.fn(text => text),
    electric: jest.fn(text => text),
    orange: jest.fn(text => text),
    pink: jest.fn(text => text),
    darkCyan: jest.fn(text => text),
    yellow: jest.fn(text => text),
    highlight: jest.fn(text => text)
  },
  createNeonBox: jest.fn((content, title) => `[${title}]\n${content}`),
  neonSymbols: {
    diamond: '◆',
    cross: '✗',
    star: '★',
    info: 'ℹ',
    warning: '⚠',
    bullet: '▶',
    arrow: '→'
  },
  neonSpinner: jest.fn(() => {
    const intervalId = setInterval(() => {}, 100);
    return intervalId;
  })
}));

describe('PowerDownStatus Command', () => {
  let command: PowerDownStatus;
  let mockKeyManager: any;
  let mockHiveClient: any;
  let consoleSpy: any;

  const testAccount = 'testuser';

  beforeEach(() => {
    // Mock console.log to capture output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Mock KeyManager
    mockKeyManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getDefaultAccount: jest.fn().mockReturnValue(testAccount)
    };
    (KeyManager as any).mockImplementation(() => mockKeyManager);

    // Mock HiveClient
    mockHiveClient = {
      getAccount: jest.fn()
    };
    (HiveClient as any).mockImplementation(() => mockHiveClient);

    command = new PowerDownStatus([], {} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockRestore();
  });

  describe('account resolution', () => {
    it('should use default account when no account specified', async () => {
      const mockAccountData = {
        name: testAccount,
        vesting_withdraw_rate: '0.000000 VESTS',
        next_vesting_withdrawal: '1969-12-31T23:59:59',
        withdrawn: 0,
        to_withdraw: 0
      };

      mockHiveClient.getAccount.mockResolvedValue(mockAccountData);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'table' }
      });

      await command.run();

      expect(mockKeyManager.getDefaultAccount).toHaveBeenCalled();
      expect(mockHiveClient.getAccount).toHaveBeenCalledWith(testAccount);
    });

    it('should clean @ prefix from account name', async () => {
      const accountWithPrefix = '@alice';
      const cleanAccount = 'alice';
      
      const mockAccountData = {
        name: cleanAccount,
        vesting_withdraw_rate: '0.000000 VESTS',
        next_vesting_withdrawal: '1969-12-31T23:59:59',
        withdrawn: 0,
        to_withdraw: 0
      };

      mockHiveClient.getAccount.mockResolvedValue(mockAccountData);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: accountWithPrefix },
        flags: { format: 'table' }
      });

      await command.run();

      expect(mockHiveClient.getAccount).toHaveBeenCalledWith(cleanAccount);
    });
  });

  describe('powerdown status detection', () => {
    it('should correctly identify no active powerdown', async () => {
      const mockAccountData = {
        name: testAccount,
        vesting_withdraw_rate: '0.000000 VESTS',
        next_vesting_withdrawal: '1969-12-31T23:59:59',
        withdrawn: 0,
        to_withdraw: 0
      };

      mockHiveClient.getAccount.mockResolvedValue(mockAccountData);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: testAccount },
        flags: { format: 'table' }
      });

      await command.run();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No active powerdown')
      );
    });

    it('should correctly identify active powerdown', async () => {
      const mockAccountData = {
        name: testAccount,
        vesting_withdraw_rate: '1000.000000 VESTS',
        next_vesting_withdrawal: '2025-08-11T12:00:00',
        withdrawn: 2,
        to_withdraw: 13000 // 13 weeks * 1000 VESTS
      };

      mockHiveClient.getAccount.mockResolvedValue(mockAccountData);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: testAccount },
        flags: { format: 'table' }
      });

      await command.run();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('POWERING DOWN')
      );
    });
  });

  describe('JSON output format', () => {
    it('should output JSON when format flag is json', async () => {
      const mockAccountData = {
        name: testAccount,
        vesting_withdraw_rate: '500.000000 VESTS',
        next_vesting_withdrawal: '2025-08-11T12:00:00',
        withdrawn: 5,
        to_withdraw: 6500
      };

      mockHiveClient.getAccount.mockResolvedValue(mockAccountData);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: testAccount },
        flags: { format: 'json' }
      });

      await command.run();

      // Check that JSON.stringify was called with the account data
      const jsonOutput = consoleSpy.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('"account"')
      );
      expect(jsonOutput).toBeDefined();
      
      const parsedOutput = JSON.parse(jsonOutput[0]);
      expect(parsedOutput).toHaveProperty('account', testAccount);
      expect(parsedOutput).toHaveProperty('is_powering_down', true);
      expect(parsedOutput).toHaveProperty('withdrawn', 5);
    });
  });

  describe('error handling', () => {
    it('should handle account not found', async () => {
      mockHiveClient.getAccount.mockResolvedValue(null);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: 'nonexistent' },
        flags: { format: 'table' }
      });

      await command.run();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Account @nonexistent not found')
      );
    });

    it('should handle network errors', async () => {
      mockHiveClient.getAccount.mockRejectedValue(new Error('Network error'));

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: testAccount },
        flags: { format: 'table' }
      });

      await command.run();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch powerdown status')
      );
    });

    it('should handle missing default account', async () => {
      mockKeyManager.getDefaultAccount.mockReturnValue(null);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: undefined },
        flags: { format: 'table' }
      });

      await command.run();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No account specified and no default account set')
      );
    });
  });

  describe('time calculations', () => {
    it('should calculate powerdown progress correctly', async () => {
      const mockAccountData = {
        name: testAccount,
        vesting_withdraw_rate: '1000.000000 VESTS',
        next_vesting_withdrawal: '2025-08-11T12:00:00',
        withdrawn: 7, // 7 weeks completed
        to_withdraw: 13000 // 13 weeks total
      };

      mockHiveClient.getAccount.mockResolvedValue(mockAccountData);

      jest.spyOn(command, 'parse').mockResolvedValue({
        args: { account: testAccount },
        flags: { format: 'table' }
      });

      await command.run();

      // Should show 7/13 weeks completed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('7/13 weeks completed')
      );
    });
  });
});
