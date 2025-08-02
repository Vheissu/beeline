import { Client, PrivateKey, cryptoUtils, Asset } from '@hiveio/dhive';
import { KeyManager } from './crypto.js';

export interface HiveBalance {
  hive: string;
  hbd: string;
  hp: string;
  savings_hive: string;
  savings_hbd: string;
}

export interface HiveAccount {
  name: string;
  balance: string;
  hbd_balance: string;
  vesting_shares: string;
  savings_balance: string;
  savings_hbd_balance: string;
  delegated_vesting_shares: string;
  received_vesting_shares: string;
}

export class HiveClient {
  private client: Client;
  private keyManager: KeyManager;

  constructor(keyManager: KeyManager, nodeUrl?: string) {
    // Default to public Hive API nodes
    const nodes = nodeUrl ? [nodeUrl] : [
      'https://api.hive.blog',
      'https://hived.emre.sh',
      'https://rpc.ausbit.dev',
      'https://api.openhive.network'
    ];
    
    this.client = new Client(nodes, {
      timeout: 10000,
      failoverThreshold: 3,
      consoleOnFailover: false
    });
    
    this.keyManager = keyManager;
  }

  async getAccount(username: string): Promise<HiveAccount | null> {
    try {
      const accounts = await this.client.database.getAccounts([username]);
      if (accounts.length > 0) {
        const account = accounts[0];
        return {
          name: account.name,
          balance: typeof account.balance === 'string' ? account.balance : account.balance.toString(),
          hbd_balance: typeof account.hbd_balance === 'string' ? account.hbd_balance : account.hbd_balance.toString(),
          vesting_shares: typeof account.vesting_shares === 'string' ? account.vesting_shares : account.vesting_shares.toString(),
          savings_balance: typeof account.savings_balance === 'string' ? account.savings_balance : account.savings_balance.toString(),
          savings_hbd_balance: typeof account.savings_hbd_balance === 'string' ? account.savings_hbd_balance : account.savings_hbd_balance.toString(),
          delegated_vesting_shares: typeof account.delegated_vesting_shares === 'string' ? account.delegated_vesting_shares : account.delegated_vesting_shares.toString(),
          received_vesting_shares: typeof account.received_vesting_shares === 'string' ? account.received_vesting_shares : account.received_vesting_shares.toString()
        };
      }
      return null;
    } catch (error) {
      throw new Error(`Failed to fetch account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBalance(username: string): Promise<HiveBalance> {
    const account = await this.getAccount(username);
    
    if (!account) {
      throw new Error(`Account ${username} not found`);
    }

    // Get dynamic global properties for HP calculation
    const globalProps = await this.client.database.getDynamicGlobalProperties();
    const vestingShares = parseFloat(account.vesting_shares.toString().split(' ')[0]);
    const delegatedVesting = parseFloat(account.delegated_vesting_shares.toString().split(' ')[0]);
    const receivedVesting = parseFloat(account.received_vesting_shares.toString().split(' ')[0]);
    
    // Calculate effective HP (vesting shares + received - delegated)
    const effectiveVesting = vestingShares + receivedVesting - delegatedVesting;
    
    // Convert vesting shares to HIVE Power
    const totalVests = parseFloat(globalProps.total_vesting_shares.toString().split(' ')[0]);
    const totalHive = parseFloat(globalProps.total_vesting_fund_hive.toString().split(' ')[0]);
    const hivepower = (effectiveVesting * totalHive) / totalVests;

    return {
      hive: account.balance.toString().split(' ')[0],
      hbd: account.hbd_balance.toString().split(' ')[0],
      hp: hivepower.toFixed(3),
      savings_hive: account.savings_balance.toString().split(' ')[0],
      savings_hbd: account.savings_hbd_balance.toString().split(' ')[0]
    };
  }

  async transfer(
    from: string,
    to: string,
    amount: string,
    currency: 'HIVE' | 'HBD',
    memo: string = '',
    pin?: string
  ): Promise<string> {
    try {
      // Get the active key for signing
      const privateKeyWif = await this.keyManager.getPrivateKey(from, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${from}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      // Create transfer operation
      const operation: any = [
        'transfer',
        {
          from,
          to,
          amount: `${amount} ${currency}`,
          memo
        }
      ];

      // Broadcast transaction
      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      // Memory scrubbing
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async powerUp(
    from: string,
    to: string,
    amount: string,
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(from, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${from}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'transfer_to_vesting',
        {
          from,
          to,
          amount: `${amount} HIVE`
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Power up failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getNodeInfo(): Promise<{ url: string; version: string; lastBlockNum: number }> {
    try {
      const config = await this.client.database.getConfig();
      const globalProps = await this.client.database.getDynamicGlobalProperties();
      
      return {
        url: Array.isArray(this.client.address) ? this.client.address[0] : this.client.address,
        version: typeof config.HIVE_BLOCKCHAIN_VERSION === 'string' ? config.HIVE_BLOCKCHAIN_VERSION : String(config.HIVE_BLOCKCHAIN_VERSION),
        lastBlockNum: globalProps.head_block_number
      };
    } catch (error) {
      throw new Error(`Failed to get node info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getResourceCredits(username: string): Promise<{ current: number; max: number; percentage: number }> {
    try {
      const rc = await this.client.rc.findRCAccounts([username]);
      
      if (rc.length === 0) {
        throw new Error(`RC data not found for ${username}`);
      }

      const current = parseInt(rc[0].rc_manabar.current_mana);
      const max = parseInt(rc[0].max_rc);
      const percentage = (current / max) * 100;

      return { current, max, percentage };
    } catch (error) {
      throw new Error(`Failed to get RC data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}