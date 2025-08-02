import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';

export default class Balance extends Command {
  static override description = 'Show account balances (HIVE, HBD, HP, savings)';
  
  static override examples = [
    `$ beeline balance`,
    `$ beeline balance @alice`,
    `$ beeline balance --format json`
  ];

  static override flags = {
    format: Flags.string({
      char: 'f',
      description: 'output format',
      options: ['table', 'json'],
      default: 'table'
    }),
    node: Flags.string({
      char: 'n',
      description: 'RPC node to use',
    }),
    mock: Flags.boolean({
      char: 'm',
      description: 'use mock data for testing',
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
    const { args, flags } = await this.parse(Balance);
    
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
        console.log(neonChalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(neonChalk.info('Import a key first with: ') + neonChalk.highlight('beeline keys import <account> <role>'));
        return;
      }
    }
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Fetching balance for ${neonChalk.highlight('@' + account)}...`));
    
    if (flags.mock) {
      return this.showMockBalance(account, flags.format);
    }
    
    const spinner = neonSpinner('Connecting to Hive blockchain');
    
    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      
      // Get balance data
      const balances = await hiveClient.getBalance(account);
      const nodeInfo = await hiveClient.getNodeInfo();
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log('');
      
      if (flags.format === 'json') {
        console.log(JSON.stringify({
          account,
          balances,
          node: nodeInfo.url,
          last_block: nodeInfo.lastBlockNum,
          timestamp: new Date().toISOString()
        }, null, 2));
        return;
      }
      
      // Format numbers with commas
      const formatBalance = (amount: string) => {
        const num = parseFloat(amount);
        return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
      };
      
      // Cyberpunk table display
      const balanceDisplay = [
        `${neonChalk.cyan('HIVE')}     ${neonSymbols.arrow} ${neonChalk.white(formatBalance(balances.hive))} HIVE`,
        `${neonChalk.magenta('HBD')}      ${neonSymbols.arrow} ${neonChalk.white(formatBalance(balances.hbd))} HBD`,
        `${neonChalk.electric('HP')}       ${neonSymbols.arrow} ${neonChalk.white(formatBalance(balances.hp))} HP`,
        ``,
        `${neonChalk.darkCyan('SAVINGS')}`,
        `${neonChalk.cyan('├─ HIVE')} ${neonSymbols.arrow} ${neonChalk.white(formatBalance(balances.savings_hive))} HIVE`,
        `${neonChalk.magenta('└─ HBD')}  ${neonSymbols.arrow} ${neonChalk.white(formatBalance(balances.savings_hbd))} HBD`
      ].join('\n');
      
      console.log(createNeonBox(balanceDisplay, `WALLET ${neonSymbols.star} @${account.toUpperCase()}`));
      console.log('');
      
      // Status indicators
      console.log(neonChalk.success(`${neonSymbols.check} Connected to Hive network`));
      console.log(neonChalk.info(`${neonSymbols.bullet} Node: ${nodeInfo.url}`));
      console.log(neonChalk.info(`${neonSymbols.bullet} Block: #${nodeInfo.lastBlockNum.toLocaleString()}`));
      console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Last updated: ${new Date().toLocaleTimeString()}`));
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Failed to fetch balance: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Try using mock data: ') + neonChalk.highlight(`beeline balance ${account} --mock`));
    }
  }
  
  private showMockBalance(account: string, format?: string): void {
    const balances = {
      hive: '1,234.567',
      hbd: '89.123', 
      hp: '5,678.901',
      savings_hive: '100.000',
      savings_hbd: '250.500'
    };
    
    console.log('');
    
    if (format === 'json') {
      console.log(JSON.stringify({
        account,
        balances,
        mock: true,
        timestamp: new Date().toISOString()
      }, null, 2));
      return;
    }
    
    const balanceDisplay = [
      `${neonChalk.cyan('HIVE')}     ${neonSymbols.arrow} ${neonChalk.white(balances.hive)} HIVE`,
      `${neonChalk.magenta('HBD')}      ${neonSymbols.arrow} ${neonChalk.white(balances.hbd)} HBD`,
      `${neonChalk.electric('HP')}       ${neonSymbols.arrow} ${neonChalk.white(balances.hp)} HP`,
      ``,
      `${neonChalk.darkCyan('SAVINGS')}`,
      `${neonChalk.cyan('├─ HIVE')} ${neonSymbols.arrow} ${neonChalk.white(balances.savings_hive)} HIVE`,
      `${neonChalk.magenta('└─ HBD')}  ${neonSymbols.arrow} ${neonChalk.white(balances.savings_hbd)} HBD`
    ].join('\n');
    
    console.log(createNeonBox(balanceDisplay, `WALLET ${neonSymbols.star} @${account.toUpperCase()} ${neonChalk.warning('(MOCK)')}`));
    console.log('');
    
    console.log(neonChalk.warning(`${neonSymbols.star} Mock data displayed`));
    console.log(neonChalk.info('Remove --mock flag for real blockchain data'));
  }
}