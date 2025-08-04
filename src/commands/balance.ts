import { Command, Flags, Args } from '@oclif/core';
import { getTheme, neonSymbols, playMatrixRain, getCurrentThemeName } from '../utils/neon.js';
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
    
    console.log(theme.chalk.glow(`${neonSymbols.diamond} Fetching balance for ${theme.chalk.highlight('@' + account)}...`));
    
    if (flags.mock) {
      return await this.showMockBalance(account, flags.format);
    }
    
    const spinner = theme.spinner('Connecting to Hive blockchain');
    
    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      
      // Get balance data
      const balances = await hiveClient.getBalance(account);
      const accountData = await hiveClient.getAccount(account);
      const nodeInfo = await hiveClient.getNodeInfo();
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log('');
      
      // Check powerdown status
      const withdrawRate = parseFloat(accountData?.vesting_withdraw_rate?.split(' ')[0] || '0');
      const isPoweringDown = withdrawRate > 0;
      const nextWithdrawal = accountData?.next_vesting_withdrawal ? new Date(accountData.next_vesting_withdrawal) : null;
      
      if (flags.format === 'json') {
        console.log(JSON.stringify({
          account,
          balances,
          powerdown: {
            is_powering_down: isPoweringDown,
            vesting_withdraw_rate: accountData?.vesting_withdraw_rate || '0.000000 VESTS',
            next_vesting_withdrawal: accountData?.next_vesting_withdrawal || null
          },
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
      
      // Build balance display with optional powerdown info
      let balanceDisplay = [
        `${theme.chalk.success('HIVE')}     ${neonSymbols.arrow} ${theme.chalk.highlight(formatBalance(balances.hive))} HIVE`,
        `${theme.chalk.accent('HBD')}      ${neonSymbols.arrow} ${theme.chalk.highlight(formatBalance(balances.hbd))} HBD`,
        `${theme.chalk.glow('HP')}       ${neonSymbols.arrow} ${theme.chalk.highlight(formatBalance(balances.hp))} HP`,
        ``
      ];
      
      // Add powerdown status if active
      if (isPoweringDown) {
        balanceDisplay.push(`${theme.chalk.warning('POWERDOWN')} ${neonSymbols.warning}`);
        balanceDisplay.push(`${theme.chalk.green('├─ Rate')}  ${neonSymbols.arrow} ${theme.chalk.highlight(withdrawRate.toFixed(6))} VESTS/week`);
        if (nextWithdrawal) {
          const isOverdue = nextWithdrawal < new Date();
          balanceDisplay.push(`${theme.chalk.green('└─ Next')}  ${neonSymbols.arrow} ${isOverdue ? theme.chalk.warning('OVERDUE') : theme.chalk.white(nextWithdrawal.toLocaleDateString())}`);
        }
        balanceDisplay.push(``);
      }
      
      balanceDisplay.push(`${theme.chalk.info('SAVINGS')}`);
      balanceDisplay.push(`${theme.chalk.success('├─ HIVE')} ${neonSymbols.arrow} ${theme.chalk.highlight(formatBalance(balances.savings_hive))} HIVE`);
      balanceDisplay.push(`${theme.chalk.accent('└─ HBD')}  ${neonSymbols.arrow} ${theme.chalk.highlight(formatBalance(balances.savings_hbd))} HBD`);
      
      console.log(theme.createBox(balanceDisplay.join('\n'), `WALLET ${neonSymbols.star} @${account.toUpperCase()}`));
      console.log('');
      
      // Status indicators
      console.log(theme.chalk.success(`${neonSymbols.check} Connected to Hive network`));
      console.log(theme.chalk.info(`${neonSymbols.bullet} Node: ${nodeInfo.url}`));
      console.log(theme.chalk.info(`${neonSymbols.bullet} Block: #${nodeInfo.lastBlockNum.toLocaleString()}`));
      if (isPoweringDown) {
        console.log(theme.chalk.warning(`${neonSymbols.bullet} Powerdown active - check status: ${theme.chalk.highlight('beeline powerdown-status')}`));
      }
      console.log(theme.chalk.info(`${neonSymbols.bullet} Last updated: ${new Date().toLocaleTimeString()}`));
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to fetch balance: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(theme.chalk.info('Try using mock data: ') + theme.chalk.highlight(`beeline balance ${account} --mock`));
    }
  }
  
  private async showMockBalance(account: string, format?: string): Promise<void> {
    const theme = await getTheme();
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
      `${theme.chalk.success('HIVE')}     ${neonSymbols.arrow} ${theme.chalk.highlight(balances.hive)} HIVE`,
      `${theme.chalk.accent('HBD')}      ${neonSymbols.arrow} ${theme.chalk.highlight(balances.hbd)} HBD`,
      `${theme.chalk.glow('HP')}       ${neonSymbols.arrow} ${theme.chalk.highlight(balances.hp)} HP`,
      ``,
      `${theme.chalk.info('SAVINGS')}`,
      `${theme.chalk.success('├─ HIVE')} ${neonSymbols.arrow} ${theme.chalk.highlight(balances.savings_hive)} HIVE`,
      `${theme.chalk.accent('└─ HBD')}  ${neonSymbols.arrow} ${theme.chalk.highlight(balances.savings_hbd)} HBD`
    ].join('\n');
    
    console.log(theme.createBox(balanceDisplay, `WALLET ${neonSymbols.star} @${account.toUpperCase()} ${theme.chalk.warning('(MOCK)')}`));
    console.log('');
    
    console.log(theme.chalk.warning(`${neonSymbols.star} Mock data displayed`));
    console.log(theme.chalk.info('Remove --mock flag for real blockchain data'));
  }
}