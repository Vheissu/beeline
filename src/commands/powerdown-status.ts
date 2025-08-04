import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';

export default class PowerDownStatus extends Command {
  static override description = 'Check current powerdown status and withdrawal schedule';
  
  static override examples = [
    `$ beeline powerdown-status`,
    `$ beeline powerdown-status alice`,
    `$ beeline powerdown-status alice --format json`
  ];

  static override flags = {
    node: Flags.string({
      char: 'n',
      description: 'RPC node to use'
    }),
    format: Flags.string({
      char: 'f',
      description: 'output format',
      options: ['table', 'json'],
      default: 'table'
    })
  };

  static override args = {
    account: Args.string({
      description: 'account to check powerdown status for',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(PowerDownStatus);
    
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
        console.log(neonChalk.info('Specify an account or import a key first'));
        return;
      }
    }
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Checking powerdown status...`));
    console.log('');
    
    const spinner = neonSpinner('Fetching powerdown information');
    
    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      const accountData = await hiveClient.getAccount(account);
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!accountData) {
        console.log(neonChalk.error(`${neonSymbols.cross} Account @${account} not found`));
        return;
      }
      
      // Parse powerdown data
      const withdrawRate = parseFloat(accountData.vesting_withdraw_rate?.split(' ')[0] || '0');
      const nextWithdrawal = new Date(accountData.next_vesting_withdrawal);
      const withdrawn = accountData.withdrawn;
      const toWithdraw = accountData.to_withdraw;
      
      // Calculate powerdown status
      const isPoweringDown = withdrawRate > 0;
      const remainingWithdrawals = isPoweringDown ? Math.ceil((toWithdraw - withdrawn) / 13) : 0;
      const weeksPassed = withdrawn;
      const totalWeeks = toWithdraw / 13; // Each withdrawal is 1/13th
      
      if (flags.format === 'json') {
        console.log(JSON.stringify({
          account,
          is_powering_down: isPoweringDown,
          vesting_withdraw_rate: accountData.vesting_withdraw_rate,
          next_vesting_withdrawal: accountData.next_vesting_withdrawal,
          withdrawn,
          to_withdraw: toWithdraw,
          weeks_passed: weeksPassed,
          total_weeks: Math.round(totalWeeks),
          remaining_withdrawals: remainingWithdrawals,
          timestamp: new Date().toISOString()
        }, null, 2));
        return;
      }
      
      if (!isPoweringDown) {
        console.log(neonChalk.info(`${neonSymbols.info} No active powerdown for @${account}`));
        console.log('');
        
        const noPowerdownMessage = [
          `${neonChalk.darkCyan('Account: @' + account)}`,
          ``,
          `${neonChalk.green('Status: No active powerdown')}`,
          `${neonChalk.info('All Hive Power is available and not powering down')}`,
          ``,
          `${neonChalk.info('💡 Use:')} ${neonChalk.highlight('beeline powerdown <amount> HP')} ${neonChalk.info('to start powerdown')}`
        ].join('\n');
        
        console.log(createNeonBox(noPowerdownMessage, `${neonSymbols.star} POWERDOWN STATUS ${neonSymbols.star}`));
        return;
      }
      
      // Display active powerdown information
      const isOverdue = nextWithdrawal < new Date();
      const timeUntilNext = isPoweringDown ? this.formatTimeUntil(nextWithdrawal) : 'N/A';
      
      const powerdownDetails = [
        `${neonChalk.cyan('Account: @' + account)}`,
        ``,
        `${neonChalk.orange('Status:')} ${neonChalk.warning('POWERING DOWN')} ${neonSymbols.warning}`,
        `${neonChalk.electric('Withdraw Rate:')} ${neonChalk.white(withdrawRate.toFixed(6))} ${neonChalk.yellow('VESTS/week')}`,
        ``,
        `${neonChalk.magenta('Progress:')} ${neonChalk.white(weeksPassed)}/${neonChalk.white(Math.round(totalWeeks))} weeks completed`,
        `${neonChalk.pink('Remaining:')} ${neonChalk.white(remainingWithdrawals)} withdrawals`,
        ``,
        `${neonChalk.cyan('Next Withdrawal:')} ${neonChalk.white(nextWithdrawal.toLocaleString())}`,
        `${neonChalk.info('Time Until Next:')} ${isOverdue ? neonChalk.warning('OVERDUE') : neonChalk.white(timeUntilNext)}`,
        ``,
        isPoweringDown ? `${neonChalk.warning('⚠️  Powerdown in progress - cannot be stopped, only increased')}` : ''
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(powerdownDetails, `${neonSymbols.star} POWERDOWN STATUS ${neonSymbols.star}`));
      console.log('');
      
      // Status indicators
      console.log(neonChalk.info(`${neonSymbols.bullet} Check again with: ${neonChalk.highlight(`beeline powerdown-status ${account}`)}`));
      console.log(neonChalk.info(`${neonSymbols.bullet} Increase powerdown: ${neonChalk.highlight(`beeline powerdown <amount> HP`)}`));
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Failed to fetch powerdown status: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
  
  private formatTimeUntil(targetDate: Date): string {
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return 'Now';
    }
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}
