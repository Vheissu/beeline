import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Balance from '@/commands/balance';
import { KeyManager } from '@/utils/crypto';
import { HiveClient } from '@/utils/hive';

// Mock dependencies
jest.mock('@/utils/crypto');
jest.mock('@/utils/hive');
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
    darkCyan: jest.fn().mockImplementation((text: string) => text)
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
  neonSpinner: jest.fn().mockReturnValue(456)
}));

describe('Balance Command', () => {
  let balanceCommand: Balance;
  let mockKeyManager: any;
  let mockHiveClient: any;

  const testAccount = 'testuser';
  const mockBalances = {
    hive: '1234.567',
    hbd: '89.123',
    hp: '5678.901',
    savings_hive: '100.000',
    savings_hbd: '250.500'
  };
  const mockNodeInfo = {
    url: 'https://api.hive.blog',
    version: '1.26.4',
    lastBlockNum: 75000000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock KeyManager
    mockKeyManager = {
      // @ts-ignore
      initialize: jest.fn().mockResolvedValue(undefined),
      getDefaultAccount: jest.fn().mockReturnValue(testAccount)
    };

    jest.mocked(KeyManager).mockImplementation(() => mockKeyManager);

    // Mock HiveClient
    mockHiveClient = {
      // @ts-ignore
      getBalance: jest.fn().mockResolvedValue(mockBalances),
      // @ts-ignore
      getNodeInfo: jest.fn().mockResolvedValue(mockNodeInfo)
    };

    jest.mocked(HiveClient).mockImplementation(() => mockHiveClient);

    // Mock console and process
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
    const originalStringify = JSON.stringify;
    jest.spyOn(JSON, 'stringify').mockImplementation((obj, replacer, space) => {
      // Create a realistic JSON string that includes the mock property
      if (obj && typeof obj === 'object' && 'mock' in obj) {
        return originalStringify({...obj, mock: true}, replacer, space);
      }
      return originalStringify(obj, replacer, space);
    });

    balanceCommand = new Balance([], {} as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should display balance for specified account', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(mockKeyManager.initialize).toHaveBeenCalled();
      expect(mockHiveClient.getBalance).toHaveBeenCalledWith(testAccount);
      expect(mockHiveClient.getNodeInfo).toHaveBeenCalled();
    });

    it('should use default account when none specified', async () => {
      const args = { account: undefined };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(mockKeyManager.getDefaultAccount).toHaveBeenCalled();
      expect(mockHiveClient.getBalance).toHaveBeenCalledWith(testAccount);
    });

    it('should handle account with @ prefix', async () => {
      const args = { account: '@' + testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(mockHiveClient.getBalance).toHaveBeenCalledWith(testAccount);
    });

    it('should error when no account specified and no default', async () => {
      const args = { account: undefined };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockKeyManager.getDefaultAccount.mockReturnValue(undefined);

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No account specified and no default account set')
      );
      expect(mockHiveClient.getBalance).not.toHaveBeenCalled();
    });
  });

  describe('output formats', () => {
    it('should display table format by default', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      expect(createNeonBox).toHaveBeenCalledWith(
        expect.stringContaining('HIVE'),
        expect.stringContaining(`WALLET ★ @${testAccount.toUpperCase()}`)
      );
    });

    it('should display JSON format when requested', async () => {
      const args = { account: testAccount };
      const flags = { format: 'json', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      jest.spyOn(JSON, 'stringify').mockImplementation((obj) => JSON.stringify(obj));

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(testAccount)
      );
      expect(JSON.stringify).toHaveBeenCalledWith(
        expect.objectContaining({
          account: testAccount,
          balances: mockBalances,
          node: mockNodeInfo.url,
          last_block: mockNodeInfo.lastBlockNum,
          timestamp: expect.any(String)
        }),
        null,
        2
      );
    });

    it('should format numbers with commas in table format', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      // @ts-ignore
      const boxCall = createNeonBox.mock.calls.find(call => 
        call[0].includes('1,234.567')
      );
      expect(boxCall).toBeDefined();
    });
  });

  describe('mock mode', () => {
    it('should display mock data when mock flag is set', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: true };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(mockHiveClient.getBalance).not.toHaveBeenCalled();
      expect(mockHiveClient.getNodeInfo).not.toHaveBeenCalled();

      const { createNeonBox } = await import('@/utils/neon');
      expect(createNeonBox).toHaveBeenCalledWith(
        expect.stringContaining('1,234.567'),
        expect.stringContaining('(MOCK)')
      );
    });

    it('should display mock data in JSON format', async () => {
      const args = { account: testAccount };
      const flags = { format: 'json', mock: true };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('"mock": true')
      );
    });

    it('should show mock warning messages', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: true };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Mock data displayed')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Remove --mock flag for real blockchain data')
      );
    });
  });

  describe('custom node handling', () => {
    it('should use custom node when specified', async () => {
      const customNode = 'https://custom.hive.node';
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false, node: customNode };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(HiveClient).toHaveBeenCalledWith(mockKeyManager, customNode);
    });

    it('should use default nodes when not specified', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(HiveClient).toHaveBeenCalledWith(mockKeyManager, undefined);
    });
  });

  describe('spinner and UI', () => {
    it('should show spinner while fetching balance', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      const { neonSpinner } = await import('@/utils/neon');
      expect(neonSpinner).toHaveBeenCalledWith('Connecting to Hive blockchain');
    });

    it('should clear spinner on completion', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(clearInterval).toHaveBeenCalled();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('\r')
      );
    });

    it('should display status information', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Connected to Hive network')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Node: ${mockNodeInfo.url}`)
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Block: #${mockNodeInfo.lastBlockNum.toLocaleString()}`)
      );
    });
  });

  describe('error handling', () => {
    it('should handle balance fetch errors gracefully', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getBalance.mockRejectedValue(new Error('Network error'));

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch balance: Network error')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Try using mock data')
      );
    });

    it('should clear spinner on error', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getBalance.mockRejectedValue(new Error('Error'));

      await balanceCommand.run();

      expect(clearInterval).toHaveBeenCalled();
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('\r')
      );
    });

    it('should handle node info fetch errors', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getNodeInfo.mockRejectedValue(new Error('Node error'));

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch balance')
      );
    });

    it('should handle account not found errors', async () => {
      const args = { account: 'nonexistent' };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getBalance.mockRejectedValue(new Error('Account nonexistent not found'));

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch balance: Account nonexistent not found')
      );
    });
  });

  describe('balance formatting', () => {
    it('should format large numbers correctly', async () => {
      const largeBalances = {
        hive: '1234567.890',
        hbd: '98765.432',
        hp: '5678901.234',
        savings_hive: '100000.000',
        savings_hbd: '250500.123'
      };

      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getBalance.mockResolvedValue(largeBalances);

      await balanceCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      // @ts-ignore
      const boxCall = createNeonBox.mock.calls[0];
      
      expect(boxCall[0]).toContain('1,234,567.890');
      expect(boxCall[0]).toContain('98,765.432');
      expect(boxCall[0]).toContain('5,678,901.234');
    });

    it('should handle zero balances', async () => {
      const zeroBalances = {
        hive: '0.000',
        hbd: '0.000',
        hp: '0.000',
        savings_hive: '0.000',
        savings_hbd: '0.000'
      };

      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getBalance.mockResolvedValue(zeroBalances);

      await balanceCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      // @ts-ignore
      const boxCall = createNeonBox.mock.calls[0];
      
      expect(boxCall[0]).toContain('0.000 HIVE');
      expect(boxCall[0]).toContain('0.000 HBD');
      expect(boxCall[0]).toContain('0.000 HP');
    });

    it('should handle decimal precision correctly', async () => {
      const preciseBalances = {
        hive: '123.456789',
        hbd: '456.123',
        hp: '789.001',
        savings_hive: '1.999',
        savings_hbd: '0.001'
      };

      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });
      mockHiveClient.getBalance.mockResolvedValue(preciseBalances);

      await balanceCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      // @ts-ignore
      const boxCall = createNeonBox.mock.calls[0];
      
      // Should format to 3 decimal places
      expect(boxCall[0]).toContain('123.457'); // Rounded
      expect(boxCall[0]).toContain('456.123');
      expect(boxCall[0]).toContain('789.001');
    });
  });

  describe('savings display', () => {
    it('should display savings balances in hierarchical format', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      const { createNeonBox } = await import('@/utils/neon');
      // @ts-ignore
      const boxCall = createNeonBox.mock.calls[0];
      
      expect(boxCall[0]).toContain('SAVINGS');
      expect(boxCall[0]).toContain('├─ HIVE');
      expect(boxCall[0]).toContain('└─ HBD');
    });
  });

  describe('timestamp handling', () => {
    it('should include current timestamp in JSON output', async () => {
      const args = { account: testAccount };
      const flags = { format: 'json', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      const beforeTime = new Date().toISOString();
      await balanceCommand.run();
      const afterTime = new Date().toISOString();

      expect(JSON.stringify).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        }),
        null,
        2
      );
    });

    it('should show last updated time in table format', async () => {
      const args = { account: testAccount };
      const flags = { format: 'table', mock: false };

      // @ts-ignore
      jest.spyOn(balanceCommand, 'parse').mockResolvedValue({ args, flags });

      await balanceCommand.run();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Last updated:')
      );
    });
  });

  describe('command configuration', () => {
    it('should have correct static properties', () => {
      expect(Balance.description).toBe('Show account balances (HIVE, HBD, HP, savings)');
      expect(Balance.examples).toContain('$ beeline balance');
      expect(Balance.examples).toContain('$ beeline balance @alice');
      expect(Balance.flags).toHaveProperty('format');
      expect(Balance.flags).toHaveProperty('node');
      expect(Balance.flags).toHaveProperty('mock');
      expect(Balance.args).toHaveProperty('account');
    });

    it('should have correct flag defaults and options', () => {
      expect(Balance.flags.format.default).toBe('table');
      expect(Balance.flags.format.options).toEqual(['table', 'json']);
      expect(Balance.flags.mock.default).toBe(false);
    });
  });
});