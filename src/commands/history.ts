import { Command, Flags, Args } from '@oclif/core';
import { getTheme, neonSymbols, stopSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient, HiveTransaction, TransactionFilter, formatTransactionAmount, getTransactionDescription } from '../utils/hive.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';

export default class History extends Command {
  static override description = 'View account transaction history with filtering and analytics';
  
  static override examples = [
    `$ beeline history`,
    `$ beeline history alice`,
    `$ beeline history -i (interactive mode)`,
    `$ beeline history --all (show all transaction types)`,
    `$ beeline history --type transfer --limit 50`,
    `$ beeline history --start-date 2024-01-01 --end-date 2024-12-31`,
    `$ beeline history --direction incoming --currency HIVE`,
    `$ beeline history --analytics`,
    `$ beeline history --export transactions.csv`
  ];

  static override flags = {
    limit: Flags.integer({
      char: 'l',
      description: 'number of transactions to fetch',
      default: 100,
      min: 1,
      max: 1000
    }),
    start: Flags.integer({
      char: 's',
      description: 'start from transaction index (-1 for most recent)',
      default: -1
    }),
    type: Flags.string({
      char: 't',
      description: 'filter by transaction type',
      options: [
        'transfer', 'transfer_to_vesting', 'withdraw_vesting', 
        'transfer_to_savings', 'transfer_from_savings',
        'claim_reward_balance', 'author_reward', 'curation_reward',
        'delegate_vesting_shares', 'custom_json', 'vote', 'comment',
        'account_witness_vote', 'account_witness_proxy', 'interest',
        'fill_vesting_withdraw', 'fill_transfer_from_savings', 'limit_order_create',
        'limit_order_cancel', 'convert', 'account_create', 'account_update'
      ],
      multiple: true
    }),
    'start-date': Flags.string({
      description: 'filter transactions after this date (YYYY-MM-DD)'
    }),
    'end-date': Flags.string({
      description: 'filter transactions before this date (YYYY-MM-DD)'
    }),
    'min-amount': Flags.string({
      description: 'minimum transaction amount'
    }),
    'max-amount': Flags.string({
      description: 'maximum transaction amount'
    }),
    currency: Flags.string({
      char: 'c',
      description: 'filter by currency type',
      options: ['HIVE', 'HBD', 'VESTS']
    }),
    direction: Flags.string({
      char: 'd',
      description: 'filter by transfer direction',
      options: ['incoming', 'outgoing', 'all'],
      default: 'all'
    }),
    format: Flags.string({
      char: 'f',
      description: 'output format',
      options: ['table', 'json', 'detailed'],
      default: 'table'
    }),
    analytics: Flags.boolean({
      char: 'a',
      description: 'show transaction analytics and statistics',
      default: false
    }),
    export: Flags.string({
      char: 'e',
      description: 'export to CSV or JSON file'
    }),
    node: Flags.string({
      char: 'n',
      description: 'RPC node to use'
    }),
    mock: Flags.boolean({
      char: 'm',
      description: 'use mock data for testing',
      default: false
    }),
    debug: Flags.boolean({
      description: 'show debug information',
      default: false
    }),
    interactive: Flags.boolean({
      char: 'i',
      description: 'launch interactive mode with keyboard navigation',
      default: false
    }),
    all: Flags.boolean({
      description: 'show all transaction types (overrides default monetary filter)',
      default: false
    })
  };

  static override args = {
    account: Args.string({
      description: 'account name (defaults to current user)',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(History);
    
    const theme = await getTheme();
    const keyManager = new KeyManager();
    await keyManager.initialize();
    
    let account = args.account;
    
    // Clean @ prefix if provided
    if (account?.startsWith('@')) {
      account = account.substring(1);
    }
    
    // Use default account if no account specified
    if (!account) {
      account = keyManager.getDefaultAccount();
      if (!account) {
        console.log(theme.chalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(theme.chalk.info('Import a key first with: ') + theme.chalk.highlight('beeline keys import <account> <role>'));
        return;
      }
    }
    
    if (flags.mock) {
      return await this.showMockHistory(account, flags);
    }
    
    if (flags.interactive) {
      return await this.showInteractiveHistory(account, keyManager, flags, theme);
    }
    
    console.log(theme.chalk.glow(`${neonSymbols.diamond} Fetching transaction history for ${theme.chalk.highlight('@' + account)}...`));
    
    const spinner = theme.spinner('Connecting to Hive blockchain');
    
    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      
      // Build transaction filter
      let filter: TransactionFilter = {
        types: flags.type,
        startDate: flags['start-date'] ? new Date(flags['start-date']) : undefined,
        endDate: flags['end-date'] ? new Date(flags['end-date']) : undefined,
        minAmount: flags['min-amount'] ? parseFloat(flags['min-amount']) : undefined,
        maxAmount: flags['max-amount'] ? parseFloat(flags['max-amount']) : undefined,
        currency: flags.currency as 'HIVE' | 'HBD' | 'VESTS' | undefined,
        direction: flags.direction !== 'all' ? flags.direction as 'incoming' | 'outgoing' : undefined
      };
      
      // If no specific types are requested, default to meaningful transactions (unless --all flag)
      if ((!flags.type || flags.type.length === 0) && !flags.all) {
        filter.types = [
          // Monetary transactions
          'transfer',
          'transfer_to_vesting', 
          'withdraw_vesting',
          'transfer_to_savings',
          'transfer_from_savings',
          'claim_reward_balance',
          'author_reward',
          'curation_reward',
          'interest',
          'fill_vesting_withdraw',
          'fill_transfer_from_savings',
          // Content & Social transactions
          'vote',
          'comment',
          // Governance transactions (actual operation types)
          'account_witness_vote',
          'account_witness_proxy',
          // Delegation transactions
          'delegate_vesting_shares',
          // Account management
          'account_update'
        ];
      }
      
      // Remove undefined values
      Object.keys(filter).forEach(key => {
        if (filter[key as keyof TransactionFilter] === undefined) {
          delete filter[key as keyof TransactionFilter];
        }
      });
      
      // Fetch transactions
      const transactions = await hiveClient.getAccountHistory(
        account,
        flags.limit,
        flags.start,
        Object.keys(filter).length > 0 ? filter : undefined
      );
      
      stopSpinner(spinner);
      
      if (flags.debug) {
        console.log(theme.chalk.info(`${neonSymbols.bullet} Debug: Raw transaction count: ${transactions.length}`));
        if (transactions.length > 0) {
          console.log(theme.chalk.info(`${neonSymbols.bullet} Debug: First transaction type: ${transactions[0].op[0]}`));
          console.log(theme.chalk.info(`${neonSymbols.bullet} Debug: First transaction data: ${JSON.stringify(transactions[0].op[1], null, 2)}`));
        }
      }
      
      console.log('');
      
      if (flags.analytics) {
        const analytics = await hiveClient.getTransactionAnalytics(account, Object.keys(filter).length > 0 ? filter : undefined);
        await this.displayAnalytics(analytics, theme);
        console.log('');
      }
      
      if (flags.export) {
        await this.exportTransactions(transactions, flags.export, account);
        console.log(theme.chalk.success(`${neonSymbols.check} Transactions exported to ${flags.export}`));
        console.log('');
      }
      
      await this.displayTransactions(transactions, account, flags.format, theme);
      
      // Show summary
      console.log('');
      console.log(theme.chalk.success(`${neonSymbols.check} Found ${transactions.length} transactions`));
      if (Object.keys(filter).length > 0) {
        console.log(theme.chalk.info(`${neonSymbols.bullet} Filters applied: ${this.getFilterSummary(filter)}`));
      }
      
    } catch (error) {
      stopSpinner(spinner);
      
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to fetch history: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(theme.chalk.info('Try using mock data: ') + theme.chalk.highlight(`beeline history ${account} --mock`));
    }
  }
  
  private async displayTransactions(transactions: HiveTransaction[], account: string, format: string, theme: any): Promise<void> {
    if (transactions.length === 0) {
      console.log(theme.chalk.warning(`${neonSymbols.info} No transactions found`));
      return;
    }
    
    if (format === 'json') {
      console.log(JSON.stringify(transactions, null, 2));
      return;
    }
    
    if (format === 'detailed') {
      await this.displayDetailedTransactions(transactions, account, theme);
      return;
    }
    
    // Table format
    console.log(theme.createBox(
      this.formatTransactionTable(transactions, account, theme),
      `TRANSACTION HISTORY ${neonSymbols.star} @${account.toUpperCase()}`
    ));
  }
  
  private formatTransactionTable(transactions: HiveTransaction[], account: string, theme: any): string {
    const headers = [
      theme.chalk.glow('DATE'),
      theme.chalk.glow('TYPE'),
      theme.chalk.glow('DESCRIPTION'),
      theme.chalk.glow('AMOUNT'),
      theme.chalk.glow('BLOCK')
    ];
    
    const rows = transactions.slice(0, 20).map(tx => {
      const date = new Date(tx.timestamp).toLocaleDateString();
      const type = tx.op[0].toUpperCase().replace(/_/g, ' ');
      const description = getTransactionDescription(tx, account);
      
      let amount = '';
      const opData = tx.op[1];
      if (opData.amount) {
        const formatted = formatTransactionAmount(opData.amount);
        amount = `${theme.chalk.highlight(formatted.formatted)} ${theme.chalk.accent(formatted.currency)}`;
      } else if (opData.reward) {
        const formatted = formatTransactionAmount(opData.reward);
        amount = `${theme.chalk.highlight(formatted.formatted)} ${theme.chalk.accent(formatted.currency)}`;
      } else if (opData.vesting_payout) {
        const formatted = formatTransactionAmount(opData.vesting_payout);
        amount = `${theme.chalk.highlight(formatted.formatted)} ${theme.chalk.accent(formatted.currency)}`;
      }
      
      const block = tx.block.toLocaleString();
      
      return [
        theme.chalk.info(date),
        theme.chalk.success(type),
        theme.chalk.white(description),
        amount || theme.chalk.darkCyan('--'),
        theme.chalk.darkCyan(block)
      ];
    });
    
    // Simple table formatting
    const colWidths = [12, 18, 25, 15, 10];
    let table = '';
    
    // Header
    table += headers.map((header, i) => header.padEnd(colWidths[i])).join(' | ') + '\n';
    table += colWidths.map(w => '─'.repeat(w)).join('─┼─') + '\n';
    
    // Rows
    rows.forEach(row => {
      table += row.map((cell, i) => {
        // Remove ANSI codes for length calculation
        const cleanCell = cell.replace(/\u001b\[[0-9;]*m/g, '');
        const padding = Math.max(0, colWidths[i] - cleanCell.length);
        return cell + ' '.repeat(padding);
      }).join(' │ ') + '\n';
    });
    
    if (transactions.length > 20) {
      table += '\n' + theme.chalk.darkCyan(`... and ${transactions.length - 20} more transactions`);
    }
    
    return table;
  }
  
  private async displayDetailedTransactions(transactions: HiveTransaction[], account: string, theme: any): Promise<void> {
    for (let i = 0; i < Math.min(10, transactions.length); i++) {
      const tx = transactions[i];
      const opType = tx.op[0];
      const opData = tx.op[1];
      const date = new Date(tx.timestamp);
      
      console.log(theme.createBox([
        `${theme.chalk.glow('Type')}        ${neonSymbols.arrow} ${theme.chalk.success(opType.replace(/_/g, ' ').toUpperCase())}`,
        `${theme.chalk.glow('Description')} ${neonSymbols.arrow} ${theme.chalk.white(getTransactionDescription(tx, account))}`,
        `${theme.chalk.glow('Date')}        ${neonSymbols.arrow} ${theme.chalk.info(date.toLocaleString())}`,
        `${theme.chalk.glow('Block')}       ${neonSymbols.arrow} ${theme.chalk.darkCyan('#' + tx.block.toLocaleString())}`,
        opData.amount ? `${theme.chalk.glow('Amount')}      ${neonSymbols.arrow} ${theme.chalk.highlight(formatTransactionAmount(opData.amount).formatted)} ${theme.chalk.accent(formatTransactionAmount(opData.amount).currency)}` : '',
        opData.memo && opData.memo !== '' ? `${theme.chalk.glow('Memo')}        ${neonSymbols.arrow} ${theme.chalk.darkCyan(opData.memo)}` : '',
        opData.from ? `${theme.chalk.glow('From')}        ${neonSymbols.arrow} ${theme.chalk.white('@' + opData.from)}` : '',
        opData.to ? `${theme.chalk.glow('To')}          ${neonSymbols.arrow} ${theme.chalk.white('@' + opData.to)}` : '',
        tx.trx_id ? `${theme.chalk.glow('Tx Hash')}     ${neonSymbols.arrow} ${theme.chalk.darkCyan(tx.trx_id)}` : ''
      ].filter(line => line !== '').join('\n'), `TRANSACTION #${i + 1}`));
      
      if (i < Math.min(9, transactions.length - 1)) {
        console.log('');
      }
    }
    
    if (transactions.length > 10) {
      console.log('');
      console.log(theme.chalk.darkCyan(`... and ${transactions.length - 10} more transactions (use --format table to see more)`));
    }
  }
  
  private async displayAnalytics(analytics: any, theme: any): Promise<void> {
    const volumeDisplay = [
      `${theme.chalk.success('HIVE')}  ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.totalVolume.hive.toLocaleString('en-US', { minimumFractionDigits: 3 }))} HIVE`,
      `${theme.chalk.accent('HBD')}   ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.totalVolume.hbd.toLocaleString('en-US', { minimumFractionDigits: 3 }))} HBD`,
      `${theme.chalk.glow('VESTS')} ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.totalVolume.vests.toLocaleString('en-US', { minimumFractionDigits: 0 }))} VESTS`
    ];
    
    const averageDisplay = [
      `${theme.chalk.success('HIVE')} ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.averageAmount.hive.toLocaleString('en-US', { minimumFractionDigits: 3 }))}`,
      `${theme.chalk.accent('HBD')}  ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.averageAmount.hbd.toLocaleString('en-US', { minimumFractionDigits: 3 }))}`
    ];
    
    const topTypes = Object.entries(analytics.transactionsByType)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([type, count]) => 
        `${theme.chalk.white(type.replace(/_/g, ' '))} ${neonSymbols.arrow} ${theme.chalk.highlight(count as number)}`
      );
    
    console.log(theme.createBox([
      `${theme.chalk.glow('Total Transactions')} ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.totalTransactions)}`,
      ``,
      `${theme.chalk.glow('TOTAL VOLUME')}`,
      ...volumeDisplay,
      ``,
      `${theme.chalk.glow('AVERAGE AMOUNTS')}`,
      ...averageDisplay,
      ``,
      `${theme.chalk.glow('TOP TRANSACTION TYPES')}`,
      ...topTypes
    ].join('\n'), `ANALYTICS ${neonSymbols.diamond}`));
    
    // Show rewards summary if available
    if (analytics.rewardsSummary.author > 0 || analytics.rewardsSummary.curator > 0) {
      console.log('');
      console.log(theme.createBox([
        `${theme.chalk.success('Author')}   ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.rewardsSummary.author.toFixed(3))} HIVE`,
        `${theme.chalk.accent('Curator')}  ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.rewardsSummary.curator.toFixed(3))} HP`,
        `${theme.chalk.glow('Vesting')}   ${neonSymbols.arrow} ${theme.chalk.highlight(analytics.rewardsSummary.vesting.toFixed(3))} HP`
      ].join('\n'), `REWARDS SUMMARY ${neonSymbols.star}`));
    }
  }
  
  private async exportTransactions(transactions: HiveTransaction[], filename: string, account: string): Promise<void> {
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.json') {
      await fs.writeJSON(filename, {
        account,
        timestamp: new Date().toISOString(),
        count: transactions.length,
        transactions
      }, { spaces: 2 });
    } else if (ext === '.csv') {
      const csvHeader = 'Date,Type,Description,Amount,Currency,From,To,Memo,Block,TxHash\n';
      const csvRows = transactions.map(tx => {
        const opType = tx.op[0];
        const opData = tx.op[1];
        const date = new Date(tx.timestamp).toISOString();
        const description = getTransactionDescription(tx, account).replace(/,/g, ';');
        
        let amount = '';
        let currency = '';
        if (opData.amount) {
          const formatted = formatTransactionAmount(opData.amount);
          amount = formatted.value.toString();
          currency = formatted.currency;
        }
        
        const from = opData.from || '';
        const to = opData.to || '';
        const memo = (opData.memo || '').replace(/,/g, ';');
        const block = tx.block;
        const txHash = tx.trx_id || '';
        
        return `${date},${opType},${description},${amount},${currency},${from},${to},${memo},${block},${txHash}`;
      }).join('\n');
      
      await fs.writeFile(filename, csvHeader + csvRows);
    } else {
      throw new Error('Unsupported export format. Use .json or .csv extension.');
    }
  }
  
  private getFilterSummary(filter: TransactionFilter): string {
    const parts = [];
    
    if (filter.types) {
      parts.push(`types: ${filter.types.join(', ')}`);
    }
    if (filter.direction) {
      parts.push(`direction: ${filter.direction}`);
    }
    if (filter.currency) {
      parts.push(`currency: ${filter.currency}`);
    }
    if (filter.startDate) {
      parts.push(`from: ${filter.startDate.toDateString()}`);
    }
    if (filter.endDate) {
      parts.push(`to: ${filter.endDate.toDateString()}`);
    }
    if (filter.minAmount) {
      parts.push(`min: ${filter.minAmount}`);
    }
    if (filter.maxAmount) {
      parts.push(`max: ${filter.maxAmount}`);
    }
    
    return parts.join(', ');
  }
  
  private async showMockHistory(account: string, flags: any): Promise<void> {
    const theme = await getTheme();
    
    const mockTransactions: HiveTransaction[] = [
      {
        trx_id: '4a1b2c3d4e5f',
        block: 87654321,
        trx_in_block: 5,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        op: ['transfer', { from: 'alice', to: account, amount: '10.000 HIVE', memo: 'Payment for services' }]
      },
      {
        trx_id: '5f6e7d8c9b0a',
        block: 87654300,
        trx_in_block: 12,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        op: ['transfer_to_vesting', { from: account, to: account, amount: '50.000 HIVE' }]
      },
      {
        trx_id: '',
        block: 87654280,
        trx_in_block: 0,
        op_in_trx: 0,
        virtual_op: 1,
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        op: ['author_reward', { author: account, permlink: 'my-post', hive_payout: '5.234 HIVE', hbd_payout: '2.100 HBD', vesting_payout: '15.678 VESTS' }]
      },
      {
        trx_id: '9a8b7c6d5e4f',
        block: 87654250,
        trx_in_block: 8,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 345600000).toISOString(),
        op: ['transfer_to_savings', { from: account, to: account, amount: '100.000 HBD', memo: 'Long term savings' }]
      }
    ];
    
    console.log('');
    
    if (flags.analytics) {
      const mockAnalytics = {
        totalTransactions: 4,
        totalVolume: { hive: 65.234, hbd: 102.100, vests: 15.678 },
        averageAmount: { hive: 21.745, hbd: 51.050 },
        transactionsByType: {
          'transfer': 1,
          'transfer_to_vesting': 1,
          'author_reward': 1,
          'transfer_to_savings': 1
        },
        rewardsSummary: { author: 5.234, curator: 0, vesting: 15.678 }
      };
      
      await this.displayAnalytics(mockAnalytics, theme);
      console.log('');
    }
    
    if (flags.export) {
      await this.exportTransactions(mockTransactions, flags.export, account);
      console.log(theme.chalk.success(`${neonSymbols.check} Mock transactions exported to ${flags.export}`));
      console.log('');
    }
    
    await this.displayTransactions(mockTransactions, account, flags.format, theme);
    
    console.log('');
    console.log(theme.chalk.warning(`${neonSymbols.star} Mock data displayed`));
    console.log(theme.chalk.info('Remove --mock flag for real blockchain data'));
  }
  
  private async showInteractiveHistory(account: string, keyManager: KeyManager, flags: any, theme: any): Promise<void> {
    const hiveClient = new HiveClient(keyManager, flags.node);
    
    // Transaction type groups for easy selection
    const transactionGroups = {
      'monetary': ['transfer', 'transfer_to_vesting', 'withdraw_vesting', 'transfer_to_savings', 'transfer_from_savings', 'claim_reward_balance', 'author_reward', 'curation_reward', 'interest', 'fill_vesting_withdraw', 'fill_transfer_from_savings'],
      'transfers': ['transfer', 'transfer_to_vesting', 'transfer_to_savings', 'transfer_from_savings'],
      'rewards': ['author_reward', 'curation_reward', 'interest', 'claim_reward_balance'],
      'power': ['transfer_to_vesting', 'withdraw_vesting', 'fill_vesting_withdraw'],
      'savings': ['transfer_to_savings', 'transfer_from_savings', 'fill_transfer_from_savings', 'interest'],
      'social': ['vote', 'comment', 'custom_json', 'follow'],
      'account': ['account_update', 'account_update2', 'change_recovery_account'],
      'all': []
    };
    
    let currentFilter: TransactionFilter = { types: transactionGroups.monetary };
    let transactions: HiveTransaction[] = [];
    let currentPage = 0;
    const pageSize = 20;
    
    // Initial load
    console.log(theme.chalk.glow(`${neonSymbols.diamond} Welcome to Interactive Transaction History for ${theme.chalk.highlight('@' + account)}`));
    await this.loadTransactions(hiveClient, account, currentFilter, theme);
    
    while (true) {
      console.clear();
      
      // Header
      console.log(theme.createBox(
        `${theme.chalk.glow('INTERACTIVE HISTORY')} ${neonSymbols.star} ${theme.chalk.highlight('@' + account.toUpperCase())}\n` +
        `${theme.chalk.info('Use arrow keys to navigate, Enter to select, q to quit')}\n\n` +
        `Current Filter: ${theme.chalk.accent(this.getCurrentFilterName(currentFilter))}`,
        'TRANSACTION BROWSER'
      ));
      console.log('');
      
      const choices = [
        { name: `${neonSymbols.diamond} View Transactions`, value: 'view' },
        { name: `${neonSymbols.bullet} Filter: ${this.getCurrentFilterName(currentFilter)}`, value: 'filter' },
        { name: `${neonSymbols.bullet} Analytics`, value: 'analytics' },
        { name: `${neonSymbols.bullet} Export Data`, value: 'export' },
        { name: `${neonSymbols.bullet} Change Account`, value: 'account' },
        new inquirer.Separator(),
        { name: `${neonSymbols.cross} Quit`, value: 'quit' }
      ];
      
      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: choices,
        pageSize: 10
      }]);
      
      switch (action) {
        case 'view':
          await this.showTransactionView(hiveClient, account, currentFilter, theme);
          break;
          
        case 'filter':
          const newFilter = await this.showFilterMenu(transactionGroups, currentFilter, theme);
          if (newFilter) {
            currentFilter = newFilter;
            console.log(theme.chalk.info(`${neonSymbols.bullet} Filter updated!`));
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          break;
          
        case 'analytics':
          await this.showAnalyticsView(hiveClient, account, currentFilter, theme);
          break;
          
        case 'export':
          await this.showExportMenu(hiveClient, account, currentFilter, theme);
          break;
          
        case 'account':
          console.log(theme.chalk.info('Account switching not implemented yet'));
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
          
        case 'quit':
          console.log(theme.chalk.glow(`${neonSymbols.star} Thanks for using Beeline Transaction History!`));
          return;
      }
    }
  }
  
  private async loadTransactions(hiveClient: HiveClient, account: string, filter: TransactionFilter, theme: any): Promise<HiveTransaction[]> {
    const spinner = theme.spinner('Loading transactions...');
    try {
      const transactions = await hiveClient.getAccountHistory(account, 100, -1, filter);
      stopSpinner(spinner);
      return transactions;
    } catch (error) {
      stopSpinner(spinner);
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to load transactions: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return [];
    }
  }
  
  private getCurrentFilterName(filter: TransactionFilter): string {
    if (!filter.types || filter.types.length === 0) return 'All Transactions';
    
    const transactionGroups = {
      'monetary': ['transfer', 'transfer_to_vesting', 'withdraw_vesting', 'transfer_to_savings', 'transfer_from_savings', 'claim_reward_balance', 'author_reward', 'curation_reward', 'interest', 'fill_vesting_withdraw', 'fill_transfer_from_savings'],
      'transfers': ['transfer', 'transfer_to_vesting', 'transfer_to_savings', 'transfer_from_savings'],
      'rewards': ['author_reward', 'curation_reward', 'interest', 'claim_reward_balance'],
      'power': ['transfer_to_vesting', 'withdraw_vesting', 'fill_vesting_withdraw'],
      'savings': ['transfer_to_savings', 'transfer_from_savings', 'fill_transfer_from_savings', 'interest'],
      'social': ['vote', 'comment', 'custom_json', 'follow'],
      'account': ['account_update', 'account_update2', 'change_recovery_account']
    };
    
    for (const [groupName, types] of Object.entries(transactionGroups)) {
      if (JSON.stringify(filter.types.sort()) === JSON.stringify(types.sort())) {
        return groupName.charAt(0).toUpperCase() + groupName.slice(1);
      }
    }
    
    return `${filter.types.length} Selected Types`;
  }
  
  private async showFilterMenu(transactionGroups: Record<string, string[]>, currentFilter: TransactionFilter, theme: any): Promise<TransactionFilter | null> {
    console.clear();
    console.log(theme.createBox(
      `${theme.chalk.glow('TRANSACTION FILTERS')}\n` +
      `${theme.chalk.info('Select transaction types to display')}`,
      'FILTER SELECTION'
    ));
    console.log('');
    
    const choices = [
      { name: `${neonSymbols.star} Monetary (Transfers, Rewards, Power)`, value: 'monetary' },
      { name: `${neonSymbols.arrow} Transfers Only`, value: 'transfers' },
      { name: `${neonSymbols.diamond} Rewards Only`, value: 'rewards' },
      { name: `${neonSymbols.bullet} Power Operations`, value: 'power' },
      { name: `${neonSymbols.bullet} Savings Operations`, value: 'savings' },
      { name: `${neonSymbols.bullet} Social (Votes, Comments)`, value: 'social' },
      { name: `${neonSymbols.bullet} Account Updates`, value: 'account' },
      { name: `${neonSymbols.grid} All Transactions`, value: 'all' },
      new inquirer.Separator(),
      { name: `${neonSymbols.cross} Cancel`, value: 'cancel' }
    ];
    
    const { filterType } = await inquirer.prompt([{
      type: 'list',
      name: 'filterType',
      message: 'Select transaction filter:',
      choices: choices,
      pageSize: 10
    }]);
    
    if (filterType === 'cancel') return null;
    
    return {
      ...currentFilter,
      types: transactionGroups[filterType]
    };
  }
  
  private async showTransactionView(hiveClient: HiveClient, account: string, filter: TransactionFilter, theme: any): Promise<void> {
    const transactions = await this.loadTransactions(hiveClient, account, filter, theme);
    
    if (transactions.length === 0) {
      console.clear();
      console.log(theme.chalk.warning(`${neonSymbols.info} No transactions found with current filter`));
      console.log(theme.chalk.info('Press Enter to continue...'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
      return;
    }
    
    console.clear();
    await this.displayTransactions(transactions, account, 'table', theme);
    console.log('');
    console.log(theme.chalk.info('Press Enter to continue...'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
  }
  
  private async showAnalyticsView(hiveClient: HiveClient, account: string, filter: TransactionFilter, theme: any): Promise<void> {
    console.clear();
    console.log(theme.chalk.glow(`${neonSymbols.diamond} Generating analytics...`));
    
    try {
      const analytics = await hiveClient.getTransactionAnalytics(account, filter);
      console.clear();
      await this.displayAnalytics(analytics, theme);
      console.log('');
      console.log(theme.chalk.info('Press Enter to continue...'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: '' }]);
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to generate analytics`));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  private async showExportMenu(hiveClient: HiveClient, account: string, filter: TransactionFilter, theme: any): Promise<void> {
    console.clear();
    console.log(theme.createBox('Export transaction data to file', 'EXPORT DATA'));
    console.log('');
    
    const { format } = await inquirer.prompt([{
      type: 'list',
      name: 'format',
      message: 'Select export format:',
      choices: [
        { name: `${neonSymbols.bullet} CSV (Excel compatible)`, value: 'csv' },
        { name: `${neonSymbols.bullet} JSON (Developer format)`, value: 'json' },
        { name: `${neonSymbols.cross} Cancel`, value: 'cancel' }
      ]
    }]);
    
    if (format === 'cancel') return;
    
    const { filename } = await inquirer.prompt([{
      type: 'input',
      name: 'filename',
      message: 'Enter filename:',
      default: `${account}-transactions.${format}`
    }]);
    
    console.log(theme.chalk.info(`${neonSymbols.bullet} Exporting...`));
    
    try {
      const transactions = await hiveClient.getAccountHistory(account, 1000, -1, filter);
      await this.exportTransactions(transactions, filename, account);
      console.log(theme.chalk.success(`${neonSymbols.check} Exported ${transactions.length} transactions to ${filename}`));
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}