import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock modules at the top level
jest.mock('keytar', () => ({
  setPassword: jest.fn(),
  getPassword: jest.fn(),
  deletePassword: jest.fn()
}));

jest.mock('fs-extra', () => ({
  ensureDir: jest.fn(),
  pathExists: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn()
}));

const mockAESEncrypt = jest.fn();
const mockAESDecrypt = jest.fn();

// Create the mock structure that matches how CryptoJS is actually used
const mockCryptoJS = {
  AES: {
    encrypt: mockAESEncrypt,
    decrypt: mockAESDecrypt
  },
  enc: {
    Utf8: 'utf8'
  }
};

jest.mock('crypto-js', () => mockCryptoJS);

jest.mock('@hiveio/dhive', () => ({
  PrivateKey: {
    fromString: jest.fn(),
    fromLogin: jest.fn()
  }
}));

import { KeyManager } from '../../../src/utils/crypto';
import * as keytar from 'keytar';
import * as fs from 'fs-extra';
import CryptoJS from 'crypto-js';
import { PrivateKey } from '@hiveio/dhive';

describe('KeyManager', () => {
  let keyManager: KeyManager;
  
  const mockKeytar = keytar as jest.Mocked<typeof keytar>;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockCryptoJS = CryptoJS as jest.Mocked<typeof CryptoJS>;
  const mockPrivateKey = PrivateKey as jest.Mocked<typeof PrivateKey>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock behaviors
    (mockFs.ensureDir as any).mockResolvedValue(undefined);
    (mockFs.pathExists as any).mockResolvedValue(false);
    mockFs.readJson.mockResolvedValue({
      accounts: {},
      encryptionEnabled: true
    });
    mockFs.writeJson.mockResolvedValue(undefined);
    
    mockKeytar.setPassword.mockResolvedValue(undefined);
    mockKeytar.getPassword.mockResolvedValue('test-key');
    mockKeytar.deletePassword.mockResolvedValue(true);
    
    const mockKeyInstance = {
      toString: jest.fn().mockReturnValue('5JTestPrivateKey123'),
      createPublic: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('STMTestPublicKey123')
      })
    };
    
    mockPrivateKey.fromString.mockReturnValue(mockKeyInstance as any);
    mockPrivateKey.fromLogin.mockReturnValue(mockKeyInstance as any);
    
    // Setup mock behaviors
    mockAESEncrypt.mockReturnValue({
      toString: jest.fn().mockReturnValue('encrypted-data')
    });
    
    mockAESDecrypt.mockReturnValue({
      toString: jest.fn().mockReturnValue('5JTestPrivateKey123')
    });

    keyManager = new KeyManager();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await keyManager.initialize();
      
      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.pathExists).toHaveBeenCalled();
    });

    it('should handle missing config file', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);
      
      await keyManager.initialize();
      
      expect(mockFs.readJson).not.toHaveBeenCalled();
    });

    it('should load existing config', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        accounts: { testuser: [] },
        encryptionEnabled: true
      });
      
      await keyManager.initialize();
      
      expect(mockFs.readJson).toHaveBeenCalled();
    });

    it('should handle corrupted config gracefully', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      mockFs.readJson.mockRejectedValue(new Error('Corrupted JSON'));
      
      await expect(keyManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('key management', () => {
    beforeEach(async () => {
      await keyManager.initialize();
    });

    it('should import private key successfully', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      
      expect(mockAESEncrypt).toHaveBeenCalledWith('5JTestKey', '1234');
      expect(mockKeytar.setPassword).toHaveBeenCalled();
      expect(mockFs.writeJson).toHaveBeenCalled();
    });

    it('should import key without PIN', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey');
      
      expect(mockAESEncrypt).not.toHaveBeenCalled();
      expect(mockKeytar.setPassword).toHaveBeenCalledWith(
        'beeline-wallet',
        'beeline-wallet:testuser:posting', 
        '5JTestKey'
      );
    });

    it('should retrieve private key with correct PIN', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      
      mockKeytar.getPassword.mockResolvedValue('encrypted-data');
      mockAESDecrypt.mockReturnValue({
        toString: jest.fn().mockReturnValue('5JTestKey')
      } as any);
      
      const result = await keyManager.getPrivateKey('testuser', 'posting', '1234');
      
      expect(result).toBe('5JTestKey');
      expect(mockAESDecrypt).toHaveBeenCalledWith('encrypted-data', '1234');
    });

    it('should fail with wrong PIN', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      
      mockKeytar.getPassword.mockResolvedValue('encrypted-data');
      mockAESDecrypt.mockReturnValue({
        toString: jest.fn().mockReturnValue('')
      } as any);
      
      await expect(
        keyManager.getPrivateKey('testuser', 'posting', 'wrong')
      ).rejects.toThrow('Invalid PIN');
    });

    it('should return null for non-existent key', async () => {
      mockKeytar.getPassword.mockResolvedValue(null);
      
      const result = await keyManager.getPrivateKey('nonexistent', 'posting', '1234');
      
      expect(result).toBeNull();
    });

    it('should handle invalid private key', async () => {
      mockPrivateKey.fromString.mockImplementation(() => {
        throw new Error('Invalid private key');
      });
      
      await expect(
        keyManager.importPrivateKey('testuser', 'posting', 'invalid-key', '1234')
      ).rejects.toThrow('Invalid private key');
    });

    it('should remove key successfully', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      await keyManager.removeKey('testuser', 'posting');
      
      expect(mockKeytar.deletePassword).toHaveBeenCalledWith(
        'beeline-wallet',
        'beeline-wallet:testuser:posting'
      );
      expect(mockFs.writeJson).toHaveBeenCalled();
    });
  });

  describe('account management', () => {
    beforeEach(async () => {
      await keyManager.initialize();
    });

    it('should list accounts', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        accounts: {
          user1: [{ account: 'user1', role: 'posting', publicKey: 'key1', encrypted: true }],
          user2: [{ account: 'user2', role: 'posting', publicKey: 'key2', encrypted: true }]
        },
        encryptionEnabled: true
      });
      
      await keyManager.initialize();
      const accounts = await keyManager.listAccounts();
      
      expect(accounts).toEqual(['user1', 'user2']);
    });

    it('should check if account exists', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({
        accounts: {
          testuser: [{ account: 'testuser', role: 'posting', publicKey: 'key', encrypted: true }]
        },
        encryptionEnabled: true
      });
      
      await keyManager.initialize();
      
      expect(await keyManager.hasAccount('testuser')).toBe(true);
      expect(await keyManager.hasAccount('nonexistent')).toBe(false);
    });

    it('should set first account as default', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      
      expect(keyManager.getDefaultAccount()).toBe('testuser');
    });

    it('should get account summary', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      
      const summary = await keyManager.getAccountSummary('testuser');
      
      expect(summary).toEqual({
        account: 'testuser',
        keyCount: 1,
        roles: ['posting'],
        isDefault: true
      });
    });

    it('should return null for non-existent account summary', async () => {
      const summary = await keyManager.getAccountSummary('nonexistent');
      expect(summary).toBeNull();
    });
  });

  describe('key derivation', () => {
    it('should derive keys from password', () => {
      const result = keyManager.deriveKeysFromPassword('testuser', 'password123');
      
      expect(mockPrivateKey.fromLogin).toHaveBeenCalledWith('testuser', 'password123', 'owner');
      expect(mockPrivateKey.fromLogin).toHaveBeenCalledWith('testuser', 'password123', 'active');
      expect(mockPrivateKey.fromLogin).toHaveBeenCalledWith('testuser', 'password123', 'posting');
      expect(mockPrivateKey.fromLogin).toHaveBeenCalledWith('testuser', 'password123', 'memo');
      
      expect(result).toHaveProperty('owner');
      expect(result).toHaveProperty('active');
      expect(result).toHaveProperty('posting');
      expect(result).toHaveProperty('memo');
    });

    it('should handle derivation errors', () => {
      mockPrivateKey.fromLogin.mockImplementation(() => {
        throw new Error('Derivation failed');
      });
      
      expect(() => {
        keyManager.deriveKeysFromPassword('testuser', 'bad');
      }).toThrow('Failed to derive keys');
    });
  });

  describe('login with password', () => {
    beforeEach(async () => {
      await keyManager.initialize();
    });

    it('should login successfully', async () => {
      const importSpy = jest.spyOn(keyManager, 'importPrivateKey').mockResolvedValue();
      const scrubSpy = jest.spyOn(keyManager, 'scrubMemory').mockImplementation(() => {});
      
      await keyManager.loginWithPassword('testuser', 'password123', '1234', ['posting']);
      
      expect(importSpy).toHaveBeenCalledWith('testuser', 'posting', '5JTestPrivateKey123', '1234');
      expect(scrubSpy).toHaveBeenCalledWith('password123');
    });

    it('should scrub memory on error', async () => {
      jest.spyOn(keyManager, 'importPrivateKey').mockRejectedValue(new Error('Import failed'));
      const scrubSpy = jest.spyOn(keyManager, 'scrubMemory').mockImplementation(() => {});
      
      await expect(
        keyManager.loginWithPassword('testuser', 'password123', '1234')
      ).rejects.toThrow('Login failed');
      
      expect(scrubSpy).toHaveBeenCalledWith('password123');
    });

    it('should use default roles when none specified', async () => {
      const importSpy = jest.spyOn(keyManager, 'importPrivateKey').mockResolvedValue();
      
      await keyManager.loginWithPassword('testuser', 'password123', '1234');
      
      expect(importSpy).toHaveBeenCalledTimes(3); // posting, active, memo
    });
  });

  describe('error handling', () => {
    it('should handle keytar errors', async () => {
      mockKeytar.setPassword.mockRejectedValue(new Error('Keychain error'));
      
      await keyManager.initialize();
      
      await expect(
        keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234')
      ).rejects.toThrow();
    });

    it('should handle filesystem errors', async () => {
      mockFs.writeJson.mockRejectedValue(new Error('Write error'));
      
      await keyManager.initialize();
      
      await expect(
        keyManager.saveConfig()
      ).rejects.toThrow('Write error');
    });

    it('should handle key retrieval errors', async () => {
      mockKeytar.getPassword.mockRejectedValue(new Error('Keychain error'));
      
      await expect(
        keyManager.getPrivateKey('testuser', 'posting', '1234')
      ).rejects.toThrow('Failed to retrieve key');
    });
  });

  describe('memory scrubbing', () => {
    it('should scrub memory safely', () => {
      expect(() => {
        keyManager.scrubMemory('sensitive-data');
      }).not.toThrow();
    });

    it('should scrub memory with empty string', () => {
      expect(() => {
        keyManager.scrubMemory('');
      }).not.toThrow();
    });
  });

  describe('configuration management', () => {
    beforeEach(async () => {
      await keyManager.initialize();
    });

    it('should save configuration', async () => {
      await keyManager.saveConfig();
      
      expect(mockFs.writeJson).toHaveBeenCalled();
    });

    it('should set default account', async () => {
      await keyManager.importPrivateKey('testuser', 'posting', '5JTestKey', '1234');
      await keyManager.setDefaultAccount('testuser');
      
      expect(mockFs.writeJson).toHaveBeenCalled();
    });

    it('should throw error when setting non-existent default account', async () => {
      await expect(
        keyManager.setDefaultAccount('nonexistent')
      ).rejects.toThrow('Account nonexistent not found');
    });
  });
});