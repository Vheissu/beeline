import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';

export default class RC extends Command {
  static override description = 'Monitor Resource Credits (RC) with cyberpunk style - transaction power meter';
  
  static override examples = [
    `$ beeline rc`,
    `$ beeline rc alice`,
    `$ beeline rc alice --format json`,
    `$ beeline rc alice --watch`
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
    }),
    watch: Flags.boolean({
      char: 'w',
      description: 'watch RC levels continuously (updates every 30 seconds)',
      default: false
    }),
    threshold: Flags.integer({
      char: 't',
      description: 'warning threshold percentage (default: 20%)',
      default: 20
    })
  };

  static override args = {
    account: Args.string({
      description: 'account to check RC for',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(RC);

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

    const hiveClient = new HiveClient(keyManager, flags.node);

    if (flags.watch) {
      return this.watchRC(account, hiveClient, flags.threshold);
    }

    await this.checkRC(account, hiveClient, flags.format, flags.threshold);
  }
  
  private async checkRC(account: string, hiveClient: HiveClient, format: string = 'table', threshold: number = 20): Promise<void> {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Checking Resource Credits...`));
    console.log('');

    const spinner = neonSpinner('Fetching RC data from Hive blockchain');

    try {
      const rcData = await hiveClient.getResourceCredits(account);
      
      stopSpinner(spinner);
      
      if (format === 'json') {
        console.log(JSON.stringify({
          account,
          current_rc: rcData.current,
          max_rc: rcData.max,
          percentage: rcData.percentage,
          status: this.getRCStatus(rcData.percentage, threshold)
        }, null, 2));
        return;
      }
      
      // Display RC information
      const rcStatus = this.getRCStatus(rcData.percentage, threshold);
      const statusColor = this.getRCStatusColor(rcData.percentage, threshold);
      const progressBar = this.createProgressBar(rcData.percentage);
      
      const rcDetails = [
        `${neonChalk.darkCyan('Account: @' + account)}`,
        ``,
        `${neonChalk.orange('Current RC:')} ${neonChalk.white(this.formatNumber(rcData.current))}`,
        `${neonChalk.cyan('Maximum RC:')} ${neonChalk.white(this.formatNumber(rcData.max))}`,
        `${neonChalk.electric('Percentage:')} ${statusColor(rcData.percentage.toFixed(2) + '%')}`,
        ``,
        `${neonChalk.white('RC Level:')} ${progressBar}`,
        `${neonChalk.magenta('Status:')} ${statusColor(rcStatus)}`,
        ``,
        this.getRCAdvice(rcData.percentage, threshold)
      ].join('\n');
      
      console.log(createNeonBox(rcDetails, `${neonSymbols.star} RESOURCE CREDITS STATUS ${neonSymbols.star}`));
      
      // Show transaction capacity estimate
      console.log('');
      console.log(neonChalk.info('💡 Transaction Capacity Estimates:'));
      console.log(this.getTransactionEstimates(rcData.current));
      
    } catch (error) {
      stopSpinner(spinner);
      
      console.log(neonChalk.error(`${neonSymbols.cross} RC check failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Invalid account name'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• RC data not available for account'));
    }
  }
  
  private async watchRC(account: string, hiveClient: HiveClient, threshold: number = 20): Promise<void> {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Watching Resource Credits for @${account}...`));
    console.log(neonChalk.info('💡 Updates every 30 seconds. Press Ctrl+C to stop.'));
    console.log('');

    const checkRCContinuously = async () => {
      try {
        const rcData = await hiveClient.getResourceCredits(account);
        
        // Clear screen and show timestamp
        console.clear();
        console.log(neonChalk.glow(`${neonSymbols.diamond} RC Watch Mode - @${account}`));
        console.log(neonChalk.darkCyan(`Last updated: ${new Date().toLocaleTimeString()}`));
        console.log('');
        
        const rcStatus = this.getRCStatus(rcData.percentage, threshold);
        const statusColor = this.getRCStatusColor(rcData.percentage, threshold);
        const progressBar = this.createProgressBar(rcData.percentage);
        
        const rcDetails = [
          `${neonChalk.orange('Current RC:')} ${neonChalk.white(this.formatNumber(rcData.current))}`,
          `${neonChalk.cyan('Maximum RC:')} ${neonChalk.white(this.formatNumber(rcData.max))}`,
          `${neonChalk.electric('Percentage:')} ${statusColor(rcData.percentage.toFixed(2) + '%')}`,
          ``,
          `${neonChalk.white('RC Level:')} ${progressBar}`,
          `${neonChalk.magenta('Status:')} ${statusColor(rcStatus)}`,
          ``,
          this.getRCAdvice(rcData.percentage, threshold)
        ].join('\n');
        
        console.log(createNeonBox(rcDetails, `${neonSymbols.star} LIVE RC STATUS ${neonSymbols.star}`));
        console.log('');
        console.log(neonChalk.info('Press Ctrl+C to exit watch mode'));
        
      } catch (error) {
        console.log(neonChalk.error(`${neonSymbols.cross} RC update failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    // Initial check
    await checkRCContinuously();
    
    // Set up interval for continuous monitoring
    const interval = setInterval(checkRCContinuously, 30000);
    
    // Handle Ctrl+C to exit gracefully
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('');
      console.log(neonChalk.info('RC watch mode stopped'));
      process.exit(0);
    });
  }
  
  private getRCStatus(percentage: number, threshold: number): string {
    if (percentage >= 80) return 'EXCELLENT';
    if (percentage >= 50) return 'GOOD';
    if (percentage >= threshold) return 'LOW';
    return 'CRITICAL';
  }
  
  private getRCStatusColor(percentage: number, threshold: number): (text: string) => string {
    if (percentage >= 80) return neonChalk.green;
    if (percentage >= 50) return neonChalk.cyan;
    if (percentage >= threshold) return neonChalk.orange;
    return neonChalk.error;
  }
  
  private createProgressBar(percentage: number): string {
    const barLength = 20;
    const filled = Math.round((percentage / 100) * barLength);
    const empty = barLength - filled;
    
    let bar = '';
    
    // Use different colors based on percentage
    if (percentage >= 80) {
      bar = neonChalk.green('█'.repeat(filled)) + neonChalk.darkCyan('░'.repeat(empty));
    } else if (percentage >= 50) {
      bar = neonChalk.cyan('█'.repeat(filled)) + neonChalk.darkCyan('░'.repeat(empty));
    } else if (percentage >= 20) {
      bar = neonChalk.orange('█'.repeat(filled)) + neonChalk.darkCyan('░'.repeat(empty));
    } else {
      bar = neonChalk.error('█'.repeat(filled)) + neonChalk.darkCyan('░'.repeat(empty));
    }
    
    return `[${bar}] ${percentage.toFixed(1)}%`;
  }
  
  private getRCAdvice(percentage: number, threshold: number): string {
    if (percentage >= 80) {
      return neonChalk.green('✨ Excellent! You can perform many transactions');
    } else if (percentage >= 50) {
      return neonChalk.cyan('👍 Good RC levels, normal transaction activity');
    } else if (percentage >= threshold) {
      return neonChalk.orange('⚠️  Low RC - consider reducing transaction frequency');
    } else {
      return neonChalk.error('🚨 Critical! Very limited transaction capacity');
    }
  }
  
  private formatNumber(num: number): string {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + 'B';
    } else if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
    return num.toFixed(0);
  }
  
  private getTransactionEstimates(currentRC: number): string {
    // Rough estimates based on typical RC costs
    const transferCost = 13000000; // Approximate RC cost for a transfer
    const commentCost = 200000000; // Approximate RC cost for a comment
    const voteCost = 100000000; // Approximate RC cost for a vote
    
    const transfers = Math.floor(currentRC / transferCost);
    const comments = Math.floor(currentRC / commentCost);
    const votes = Math.floor(currentRC / voteCost);
    
    return [
      `${neonChalk.cyan('Transfers:')} ~${neonChalk.white(transfers.toString())} remaining`,
      `${neonChalk.magenta('Comments:')} ~${neonChalk.white(comments.toString())} remaining`,
      `${neonChalk.electric('Votes:')} ~${neonChalk.white(votes.toString())} remaining`,
      '',
      neonChalk.darkCyan('💡 RC regenerates over 5 days - 20% per day')
    ].join('\n');
  }
}