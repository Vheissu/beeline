import { Client, PrivateKey } from '@hiveio/dhive';
import { KeyManager } from './crypto.js';

export interface HiveBalance {
  hive: string;
  hbd: string;
  hp: string;
  savings_hive: string;
  savings_hbd: string;
}

// Transaction History Interfaces
export interface HiveTransaction {
  trx_id: string;
  block: number;
  trx_in_block: number;
  op_in_trx: number;
  virtual_op: number;
  timestamp: string;
  op: [
    string, // operation type
    any     // operation data
  ];
}

export interface TransferOperation {
  from: string;
  to: string;
  amount: string;
  memo: string;
}

export interface PowerUpOperation {
  from: string;
  to: string;
  amount: string;
}

export interface PowerDownOperation {
  account: string;
  vesting_shares: string;
}

export interface RewardOperation {
  author: string;
  curator?: string;
  reward: string;
  vesting_payout: string;
  hbd_payout: string;
  hive_payout: string;
}

export interface SavingsOperation {
  from: string;
  to: string;
  amount: string;
  memo: string;
  request_id?: number;
}

export interface TransactionFilter {
  types?: string[];
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  currency?: 'HIVE' | 'HBD' | 'VESTS';
  direction?: 'incoming' | 'outgoing' | 'all';
}

export interface TransactionAnalytics {
  totalTransactions: number;
  totalVolume: {
    hive: number;
    hbd: number;
    vests: number;
  };
  totalFees: number;
  averageAmount: {
    hive: number;
    hbd: number;
  };
  transactionsByType: Record<string, number>;
  transactionsByMonth: Record<string, number>;
  topRecipients: Array<{ account: string; count: number; total: number }>;
  topSenders: Array<{ account: string; count: number; total: number }>;
  rewardsSummary: {
    author: number;
    curator: number;
    vesting: number;
  };
}

export interface WitnessInfo {
  owner: string;
  created: string;
  url: string;
  votes: string;
  virtual_last_update: string;
  virtual_position: string;
  virtual_scheduled_time: string;
  total_missed: number;
  last_aslot: number;
  last_confirmed_block_num: number;
  pow_worker: number;
  signing_key: string;
  props: {
    account_creation_fee: string;
    maximum_block_size: number;
    hbd_interest_rate: number;
  };
  hbd_exchange_rate: {
    base: string;
    quote: string;
  };
  last_hbd_exchange_update: string;
}

export interface GovernanceStatus {
  proxy: string | null;
  witnessVotes: string[];
  votingPower: string;
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
  reward_hive_balance: string;
  reward_hbd_balance: string;
  reward_vesting_balance: string;
  // Powerdown/withdrawal fields
  vesting_withdraw_rate: string;
  next_vesting_withdrawal: string;
  withdrawn: number;
  to_withdraw: number;
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
          received_vesting_shares: typeof account.received_vesting_shares === 'string' ? account.received_vesting_shares : account.received_vesting_shares.toString(),
          reward_hive_balance: typeof account.reward_hive_balance === 'string' ? account.reward_hive_balance : (account.reward_hive_balance ? account.reward_hive_balance.toString() : '0.000 HIVE'),
          reward_hbd_balance: typeof account.reward_hbd_balance === 'string' ? account.reward_hbd_balance : (account.reward_hbd_balance ? account.reward_hbd_balance.toString() : '0.000 HBD'),
          reward_vesting_balance: typeof account.reward_vesting_balance === 'string' ? account.reward_vesting_balance : (account.reward_vesting_balance ? account.reward_vesting_balance.toString() : '0.000 VESTS'),
          // Powerdown/withdrawal fields
          vesting_withdraw_rate: typeof account.vesting_withdraw_rate === 'string' ? account.vesting_withdraw_rate : (account.vesting_withdraw_rate ? account.vesting_withdraw_rate.toString() : '0.000000 VESTS'),
          next_vesting_withdrawal: account.next_vesting_withdrawal ? account.next_vesting_withdrawal.toString() : '1969-12-31T23:59:59',
          withdrawn: account.withdrawn ? parseInt(account.withdrawn.toString()) : 0,
          to_withdraw: account.to_withdraw ? parseInt(account.to_withdraw.toString()) : 0
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

  async powerDown(
    account: string,
    amount: string,
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(account, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${account}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'withdraw_vesting',
        {
          account,
          vesting_shares: `${amount} VESTS`
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Power down failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  async convertHPToVests(hp: number): Promise<number> {
    try {
      const globalProps = await this.client.database.getDynamicGlobalProperties();
      const totalVests = parseFloat(globalProps.total_vesting_shares.toString().split(' ')[0]);
      const totalHive = parseFloat(globalProps.total_vesting_fund_hive.toString().split(' ')[0]);
      
      return (hp * totalVests) / totalHive;
    } catch (error) {
      throw new Error(`Failed to convert HP to VESTS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async transferToSavings(
    from: string,
    to: string,
    amount: string,
    currency: 'HIVE' | 'HBD',
    memo: string = '',
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(from, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${from}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'transfer_to_savings',
        {
          from,
          to,
          amount: `${amount} ${currency}`,
          memo
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Transfer to savings failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async transferFromSavings(
    from: string,
    requestId: number,
    to: string,
    amount: string,
    currency: 'HIVE' | 'HBD',
    memo: string = '',
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(from, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${from}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'transfer_from_savings',
        {
          from,
          request_id: requestId,
          to,
          amount: `${amount} ${currency}`,
          memo
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Transfer from savings failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async claimRewards(
    account: string,
    rewardHive: string,
    rewardHbd: string,
    rewardVests: string,
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(account, 'posting', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Posting key not found for account ${account}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'claim_reward_balance',
        {
          account,
          reward_hive: `${rewardHive} HIVE`,
          reward_hbd: `${rewardHbd} HBD`,
          reward_vests: `${rewardVests} VESTS`
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Claim rewards failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  async broadcastCustomJson(account: string, id: string, json: any, requiredAuths: string[] = [], requiredPostingAuths: string[] = [], pin?: string): Promise<any> {
    try {
      // Get the appropriate key based on which auth is required
      const keyType = requiredAuths.length > 0 ? 'active' : 'posting';
      const privateKeyWif = await this.keyManager.getPrivateKey(account, keyType, pin);
      
      if (!privateKeyWif) {
        throw new Error(`No ${keyType} key found for @${account}. Please import your ${keyType} key first.`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);

      const operation: any = [
        'custom_json',
        {
          required_auths: requiredAuths,
          required_posting_auths: requiredPostingAuths,
          id: id,
          json: JSON.stringify(json)
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      return result;
    } catch (error) {
      throw new Error(`Failed to broadcast custom JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Transaction History Methods
  async getAccountHistory(
    username: string,
    limit: number = 100,
    start: number = -1,
    filter?: TransactionFilter
  ): Promise<HiveTransaction[]> {
    try {
      // Fetch all operations and apply filters client-side.
      // The Hive API supports server-side bitfield filters but the
      // simpler 3-parameter call is more portable across API nodes.
      const history = await this.client.database.call('get_account_history', [
        username,
        start,
        limit
      ]);

      if (!history || !Array.isArray(history)) {
        throw new Error('Invalid response from API');
      }

      const transactions: HiveTransaction[] = history.map((entry: any) => ({
        trx_id: entry[1]?.trx_id || '',
        block: entry[1]?.block || 0,
        trx_in_block: entry[1]?.trx_in_block || 0,
        op_in_trx: entry[1]?.op_in_trx || 0,
        virtual_op: entry[1]?.virtual_op === true ? 1 : 0, // Handle boolean virtual_op
        timestamp: entry[1]?.timestamp || '',
        op: entry[1]?.op || ['unknown', {}]
      }));

      // Apply additional filters
      return this.filterTransactions(transactions, username, filter);
    } catch (error) {
      throw new Error(`Failed to fetch account history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private filterTransactions(transactions: HiveTransaction[], account: string, filter?: TransactionFilter): HiveTransaction[] {
    if (!filter) return transactions;

    return transactions.filter(tx => {
      const opType = tx.op[0];
      const opData = tx.op[1];
      const txDate = new Date(tx.timestamp);

      // Type filter - most important for default behavior
      if (filter.types && filter.types.length > 0) {
        if (!filter.types.includes(opType)) {
          return false;
        }
      }

      // Date range filter
      if (filter.startDate && txDate < filter.startDate) return false;
      if (filter.endDate && txDate > filter.endDate) return false;

      // Direction filter for transfer operations
      if (filter.direction && ['transfer', 'transfer_to_vesting', 'transfer_to_savings', 'transfer_from_savings'].includes(opType)) {
        const isOutgoing = opData.from === account;
        const isIncoming = opData.to === account;
        
        if (filter.direction === 'incoming' && !isIncoming) return false;
        if (filter.direction === 'outgoing' && !isOutgoing) return false;
      }

      // Amount filter
      if ((filter.minAmount || filter.maxAmount) && opData.amount) {
        const amount = parseFloat(opData.amount.split(' ')[0]);
        if (filter.minAmount && amount < filter.minAmount) return false;
        if (filter.maxAmount && amount > filter.maxAmount) return false;
      }

      // Currency filter
      if (filter.currency && opData.amount) {
        const currency = opData.amount.split(' ')[1];
        if (currency !== filter.currency) return false;
      }

      return true;
    });
  }

  async getTransactionAnalytics(username: string, filter?: TransactionFilter): Promise<TransactionAnalytics> {
    const transactions = await this.getAccountHistory(username, 1000, -1, filter);
    
    const analytics: TransactionAnalytics = {
      totalTransactions: transactions.length,
      totalVolume: { hive: 0, hbd: 0, vests: 0 },
      totalFees: 0,
      averageAmount: { hive: 0, hbd: 0 },
      transactionsByType: {},
      transactionsByMonth: {},
      topRecipients: [],
      topSenders: [],
      rewardsSummary: { author: 0, curator: 0, vesting: 0 }
    };

    const recipients: Record<string, { count: number; total: number }> = {};
    const senders: Record<string, { count: number; total: number }> = {};
    let hiveTotal = 0, hbdTotal = 0, hiveCount = 0, hbdCount = 0;

    for (const tx of transactions) {
      const opType = tx.op[0];
      const opData = tx.op[1];
      const txDate = new Date(tx.timestamp);
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;

      // Count by type
      analytics.transactionsByType[opType] = (analytics.transactionsByType[opType] || 0) + 1;
      
      // Count by month
      analytics.transactionsByMonth[monthKey] = (analytics.transactionsByMonth[monthKey] || 0) + 1;

      // Process transfer operations
      if (['transfer', 'transfer_to_vesting', 'transfer_to_savings', 'transfer_from_savings'].includes(opType) && opData.amount) {
        const amount = parseFloat(opData.amount.split(' ')[0]);
        const currency = opData.amount.split(' ')[1];

        if (currency === 'HIVE') {
          analytics.totalVolume.hive += amount;
          hiveTotal += amount;
          hiveCount++;
        } else if (currency === 'HBD') {
          analytics.totalVolume.hbd += amount;
          hbdTotal += amount;
          hbdCount++;
        } else if (currency === 'VESTS') {
          analytics.totalVolume.vests += amount;
        }

        // Track recipients and senders
        if (opData.to && opData.to !== username) {
          recipients[opData.to] = recipients[opData.to] || { count: 0, total: 0 };
          recipients[opData.to].count++;
          recipients[opData.to].total += amount;
        }
        if (opData.from && opData.from !== username) {
          senders[opData.from] = senders[opData.from] || { count: 0, total: 0 };
          senders[opData.from].count++;
          senders[opData.from].total += amount;
        }
      }

      // Process reward operations
      if (['author_reward', 'curation_reward', 'comment_reward'].includes(opType)) {
        if (opType === 'author_reward' && opData.hive_payout) {
          analytics.rewardsSummary.author += parseFloat(opData.hive_payout.split(' ')[0]);
        }
        if (opType === 'curation_reward' && opData.reward) {
          analytics.rewardsSummary.curator += parseFloat(opData.reward.split(' ')[0]);
        }
        if (opData.vesting_payout) {
          analytics.rewardsSummary.vesting += parseFloat(opData.vesting_payout.split(' ')[0]);
        }
      }
    }

    // Calculate averages
    analytics.averageAmount.hive = hiveCount > 0 ? hiveTotal / hiveCount : 0;
    analytics.averageAmount.hbd = hbdCount > 0 ? hbdTotal / hbdCount : 0;

    // Sort and limit top recipients/senders
    analytics.topRecipients = Object.entries(recipients)
      .map(([account, data]) => ({ account, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    analytics.topSenders = Object.entries(senders)
      .map(([account, data]) => ({ account, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return analytics;
  }

  // Governance operations
  async witnessVote(
    voter: string,
    witness: string,
    approve: boolean,
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(voter, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${voter}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'account_witness_vote',
        {
          account: voter,
          witness,
          approve
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Witness vote failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async witnessProxy(
    account: string,
    proxy: string,
    pin?: string
  ): Promise<string> {
    try {
      const privateKeyWif = await this.keyManager.getPrivateKey(account, 'active', pin);
      
      if (!privateKeyWif) {
        throw new Error(`Active key not found for account ${account}`);
      }

      const privateKey = PrivateKey.fromString(privateKeyWif);
      
      const operation: any = [
        'account_witness_proxy',
        {
          account,
          proxy
        }
      ];

      const result = await this.client.broadcast.sendOperations([operation], privateKey);
      
      this.keyManager.scrubMemory(privateKeyWif);
      
      return result.id;
    } catch (error) {
      throw new Error(`Witness proxy failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getWitnesses(limit: number = 30, activeOnly: boolean = false): Promise<WitnessInfo[]> {
    try {
      const witnesses = await this.client.database.call('get_witnesses_by_vote', ['', limit]);
      
      if (activeOnly) {
        return witnesses.filter(w => w.signing_key !== 'STM1111111111111111111111111111111114T1Anm');
      }
      
      return witnesses;
    } catch (error) {
      throw new Error(`Failed to fetch witnesses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getGovernanceStatus(account: string): Promise<GovernanceStatus> {
    try {
      const accountData = await this.client.database.getAccounts([account]);
      
      if (!accountData || accountData.length === 0) {
        throw new Error(`Account ${account} not found`);
      }

      const accountInfo = accountData[0];
      
      return {
        proxy: accountInfo.proxy || null,
        witnessVotes: accountInfo.witness_votes || [],
        votingPower: (accountInfo.vesting_shares && typeof accountInfo.vesting_shares === 'string') 
          ? accountInfo.vesting_shares 
          : accountInfo.vesting_shares?.toString() || '0.000000 VESTS'
      };
    } catch (error) {
      throw new Error(`Failed to get governance status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export utility functions for transaction formatting
export function formatTransactionAmount(amount: string): { value: number; currency: string; formatted: string } {
  const parts = amount.split(' ');
  const value = parseFloat(parts[0]);
  const currency = parts[1];
  const formatted = value.toLocaleString('en-US', { 
    minimumFractionDigits: 3, 
    maximumFractionDigits: 3 
  });
  
  return { value, currency, formatted };
}

export function getTransactionDescription(tx: HiveTransaction, currentUser: string): string {
  const opType = tx.op[0];
  const opData = tx.op[1];
  
  switch (opType) {
    case 'transfer':
      const isOutgoing = opData.from === currentUser;
      const otherParty = isOutgoing ? opData.to : opData.from;
      const direction = isOutgoing ? 'to' : 'from';
      return `Transfer ${direction} @${otherParty}`;
      
    case 'transfer_to_vesting':
      return opData.from === opData.to 
        ? 'Power Up' 
        : `Power Up to @${opData.to}`;
        
    case 'withdraw_vesting':
      return 'Power Down';
      
    case 'transfer_to_savings':
      return 'Deposit to Savings';
      
    case 'transfer_from_savings':
      return 'Withdraw from Savings';
      
    case 'claim_reward_balance':
      return 'Claim Rewards';
      
    case 'author_reward':
      return 'Author Reward';
      
    case 'curation_reward':
      return 'Curation Reward';
      
    case 'interest':
      return 'Savings Interest';
      
    case 'fill_vesting_withdraw':
      return 'Power Down Payment';
      
    default:
      return opType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}