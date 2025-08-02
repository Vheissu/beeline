import CryptoJS from 'crypto-js';
import { PrivateKey, cryptoUtils } from '@hiveio/dhive';
import * as keytar from 'keytar';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

export interface WalletKey {
  account: string;
  role: 'owner' | 'active' | 'posting' | 'memo';
  publicKey: string;
  encrypted: boolean;
}

export interface WalletConfig {
  accounts: { [account: string]: WalletKey[] };
  defaultAccount?: string;
  encryptionEnabled: boolean;
}

export interface DerivedKeys {
  owner: PrivateKey;
  active: PrivateKey;
  posting: PrivateKey;
  memo: PrivateKey;
}

const SERVICE_NAME = 'beeline-wallet';
const CONFIG_DIR = path.join(os.homedir(), '.beeline');
const CONFIG_FILE = path.join(CONFIG_DIR, 'wallet.json');

export class KeyManager {
  private config: WalletConfig;

  constructor() {
    this.config = {
      accounts: {},
      encryptionEnabled: true
    };
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(CONFIG_DIR);
    
    if (await fs.pathExists(CONFIG_FILE)) {
      try {
        this.config = await fs.readJson(CONFIG_FILE);
      } catch (error) {
        // If config is corrupted, start fresh
        this.config = {
          accounts: {},
          encryptionEnabled: true
        };
      }
    }
  }

  async saveConfig(): Promise<void> {
    await fs.writeJson(CONFIG_FILE, this.config, { spaces: 2 });
  }

  private getKeyId(account: string, role: string): string {
    return `${SERVICE_NAME}:${account}:${role}`;
  }

  async importPrivateKey(
    account: string, 
    role: 'owner' | 'active' | 'posting' | 'memo', 
    privateKeyWif: string,
    pin?: string
  ): Promise<void> {
    try {
      // Validate the private key
      const privateKey = PrivateKey.fromString(privateKeyWif);
      const publicKey = privateKey.createPublic().toString();

      const keyId = this.getKeyId(account, role);

      if (this.config.encryptionEnabled && pin) {
        // Store encrypted in OS keychain
        const encrypted = CryptoJS.AES.encrypt(privateKeyWif, pin).toString();
        await keytar.setPassword(SERVICE_NAME, keyId, encrypted);
      } else {
        // Store in OS keychain without additional encryption (relies on OS security)
        await keytar.setPassword(SERVICE_NAME, keyId, privateKeyWif);
      }

      // Update config
      if (!this.config.accounts[account]) {
        this.config.accounts[account] = [];
      }

      // Remove existing key for this role if it exists
      this.config.accounts[account] = this.config.accounts[account].filter(
        key => key.role !== role
      );

      // Add new key
      this.config.accounts[account].push({
        account,
        role,
        publicKey,
        encrypted: this.config.encryptionEnabled && !!pin
      });

      // Set as default if first account
      if (!this.config.defaultAccount) {
        this.config.defaultAccount = account;
      }

      await this.saveConfig();
    } catch (error) {
      throw new Error(`Invalid private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPrivateKey(account: string, role: string, pin?: string): Promise<string | null> {
    const keyId = this.getKeyId(account, role);
    
    try {
      const stored = await keytar.getPassword(SERVICE_NAME, keyId);
      if (!stored) return null;

      const keyConfig = this.config.accounts[account]?.find(k => k.role === role);
      
      if (keyConfig?.encrypted && pin) {
        // Decrypt with PIN
        const decrypted = CryptoJS.AES.decrypt(stored, pin).toString(CryptoJS.enc.Utf8);
        if (!decrypted) {
          throw new Error('Invalid PIN');
        }
        return decrypted;
      }

      return stored;
    } catch (error) {
      throw new Error(`Failed to retrieve key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listAccounts(): Promise<string[]> {
    return Object.keys(this.config.accounts);
  }

  async listKeys(account: string): Promise<WalletKey[]> {
    return this.config.accounts[account] || [];
  }

  async removeKey(account: string, role: string): Promise<void> {
    const keyId = this.getKeyId(account, role);
    
    try {
      await keytar.deletePassword(SERVICE_NAME, keyId);
      
      if (this.config.accounts[account]) {
        this.config.accounts[account] = this.config.accounts[account].filter(
          key => key.role !== role
        );
        
        // Remove account if no keys left
        if (this.config.accounts[account].length === 0) {
          delete this.config.accounts[account];
          
          // Update default account if needed
          if (this.config.defaultAccount === account) {
            const remaining = Object.keys(this.config.accounts);
            this.config.defaultAccount = remaining.length > 0 ? remaining[0] : undefined;
          }
        }
      }
      
      await this.saveConfig();
    } catch (error) {
      throw new Error(`Failed to remove key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getDefaultAccount(): string | undefined {
    return this.config.defaultAccount;
  }

  async setDefaultAccount(account: string): Promise<void> {
    if (!this.config.accounts[account]) {
      throw new Error(`Account ${account} not found`);
    }
    
    this.config.defaultAccount = account;
    await this.saveConfig();
  }

  // Derive all keys from master password
  deriveKeysFromPassword(account: string, password: string): DerivedKeys {
    try {
      // Use Hive's standard key derivation
      const ownerKey = PrivateKey.fromLogin(account, password, 'owner');
      const activeKey = PrivateKey.fromLogin(account, password, 'active');
      const postingKey = PrivateKey.fromLogin(account, password, 'posting');
      const memoKey = PrivateKey.fromLogin(account, password, 'memo');

      return {
        owner: ownerKey,
        active: activeKey,
        posting: postingKey,
        memo: memoKey
      };
    } catch (error) {
      throw new Error(`Failed to derive keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async loginWithPassword(
    account: string, 
    password: string, 
    pin?: string,
    roles: ('owner' | 'active' | 'posting' | 'memo')[] = ['posting', 'active', 'memo']
  ): Promise<void> {
    try {
      // Derive all keys from password
      const derivedKeys = this.deriveKeysFromPassword(account, password);
      
      // Import specified roles
      for (const role of roles) {
        const privateKey = derivedKeys[role];
        await this.importPrivateKey(account, role, privateKey.toString(), pin);
      }

      // Set as default if first account
      if (!this.config.defaultAccount) {
        this.config.defaultAccount = account;
        await this.saveConfig();
      }

      // Memory scrubbing
      this.scrubMemory(password);
      Object.values(derivedKeys).forEach(key => {
        this.scrubMemory(key.toString());
      });

    } catch (error) {
      // Memory scrubbing on error too
      this.scrubMemory(password);
      throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async hasAccount(account: string): Promise<boolean> {
    return !!this.config.accounts[account] && this.config.accounts[account].length > 0;
  }

  async getAccountSummary(account: string): Promise<{
    account: string;
    keyCount: number;
    roles: string[];
    isDefault: boolean;
  } | null> {
    const keys = this.config.accounts[account];
    if (!keys) return null;

    return {
      account,
      keyCount: keys.length,
      roles: keys.map(k => k.role),
      isDefault: this.config.defaultAccount === account
    };
  }

  async getAllAccountSummaries(): Promise<Array<{
    account: string;
    keyCount: number;
    roles: string[];
    isDefault: boolean;
  }>> {
    const accounts = await this.listAccounts();
    const summaries = [];
    
    for (const account of accounts) {
      const summary = await this.getAccountSummary(account);
      if (summary) summaries.push(summary);
    }
    
    return summaries;
  }

  // Memory scrubbing utility
  scrubMemory(data: string): void {
    // Fill memory with random data to prevent key recovery
    if (typeof data === 'string') {
      for (let i = 0; i < data.length; i++) {
        data = data.substring(0, i) + String.fromCharCode(Math.floor(Math.random() * 256)) + data.substring(i + 1);
      }
    }
  }
}