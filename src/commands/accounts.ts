import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Accounts extends Command {
  static override description = 'Manage multiple Hive accounts in your wallet';
  
  static override examples = [
    `$ beeline accounts list`,
    `$ beeline accounts switch alice`,
    `$ beeline accounts info alice`,
    `$ beeline accounts remove bob`
  ];

  static override flags = {
    format: Flags.string({
      char: 'f',
      description: 'output format',
      options: ['table', 'json'],
      default: 'table'
    }),
    force: Flags.boolean({
      description: 'force operation without confirmation',
      default: false
    })
  };

  static override args = {
    action: Args.string({
      description: 'action to perform',
      required: false,
      default: 'list',
      options: ['list', 'switch', 'info', 'remove']
    }),
    account: Args.string({
      description: 'account name',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Accounts);
    
    const keyManager = new KeyManager();
    await keyManager.initialize();
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Accessing account management...`));
    console.log('');

    switch (args.action) {
      case 'list':
        await this.listAccounts(keyManager, flags.format);
        break;
      case 'switch':
        await this.switchAccount(keyManager, args.account);
        break;
      case 'info':
        await this.showAccountInfo(keyManager, args.account);
        break;
      case 'remove':
        await this.removeAccount(keyManager, args.account, flags.force);
        break;
    }
  }

  private async listAccounts(keyManager: KeyManager, format?: string): Promise<void> {
    const summaries = await keyManager.getAllAccountSummaries();
    
    if (summaries.length === 0) {
      console.log(createNeonBox(
        `${neonChalk.warning('No accounts found in wallet')}\n\n` +
        `Add your first account with:\n` +
        `${neonChalk.highlight('beeline login <account>')}`,
        `${neonSymbols.star} ACCOUNT WALLET ${neonSymbols.star}`
      ));
      return;
    }

    if (format === 'json') {
      console.log(JSON.stringify(summaries, null, 2));
      return;
    }

    let accountDisplay = '';
    
    for (const summary of summaries) {
      const defaultIndicator = summary.isDefault ? neonChalk.yellow(' (default)') : '';
      const roleColors = summary.roles.map(role => this.getRoleColor(role)(role));
      
      accountDisplay += `${neonChalk.glow('@' + summary.account)}${defaultIndicator}\n`;
      accountDisplay += `${neonChalk.darkCyan('├─')} ${neonChalk.cyan('Keys:')} ${summary.keyCount} ${neonSymbols.arrow} ${roleColors.join(', ')}\n`;
      accountDisplay += `${neonChalk.darkCyan('└─')} ${neonChalk.magenta('Status:')} ${neonChalk.success('Ready')}\n\n`;
    }

    console.log(createNeonBox(accountDisplay.trim(), `${neonSymbols.star} ACCOUNT WALLET ${neonSymbols.star}`));
    
    // Account management commands
    console.log('');
    console.log(neonChalk.info('Account commands:'));
    console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Switch default: ${neonChalk.highlight('beeline accounts switch <account>')}`));
    console.log(neonChalk.darkCyan(`${neonSymbols.bullet} View details: ${neonChalk.highlight('beeline accounts info <account>')}`));
    console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Add account: ${neonChalk.highlight('beeline login <account>')}`));
  }

  private async switchAccount(keyManager: KeyManager, account?: string): Promise<void> {
    if (!account) {
      const accounts = await keyManager.listAccounts();
      if (accounts.length === 0) {
        console.log(neonChalk.warning('No accounts found in wallet'));
        return;
      }

      const accountPrompt = await inquirer.prompt([{
        type: 'list',
        name: 'account',
        message: neonChalk.cyan('Select default account:'),
        choices: accounts.map(acc => {
          const isDefault = keyManager.getDefaultAccount() === acc;
          return {
            name: `@${acc}${isDefault ? ' (current default)' : ''}`,
            value: acc
          };
        })
      }]);
      account = accountPrompt.account;
    }

    // Clean @ prefix if provided
    if (account!.startsWith('@')) {
      account = account!.substring(1);
    }

    try {
      await keyManager.setDefaultAccount(account!);
      
      console.log(neonChalk.success(`${neonSymbols.check} Default account switched to ${neonChalk.highlight('@' + account)}`));
      
      const summary = await keyManager.getAccountSummary(account!);
      if (summary) {
        const switchMessage = [
          `${neonChalk.glow('Account switch successful')}`,
          ``,
          `${neonChalk.cyan('New default:')} @${account}`,
          `${neonChalk.magenta('Available keys:')} ${summary.roles.join(', ')}`,
          ``,
          `${neonChalk.info('All commands will now use this account by default')}`
        ].join('\n');
        
        console.log(createNeonBox(switchMessage, `${neonSymbols.star} ACCOUNT SWITCHED ${neonSymbols.star}`));
      }
      
    } catch (error) {
      console.log(neonChalk.error(`${neonSymbols.cross} Switch failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private async showAccountInfo(keyManager: KeyManager, account?: string): Promise<void> {
    if (!account) {
      account = keyManager.getDefaultAccount();
      if (!account) {
        console.log(neonChalk.warning('No account specified and no default account set'));
        return;
      }
    }

    // Clean @ prefix if provided
    if (account!.startsWith('@')) {
      account = account!.substring(1);
    }

    const summary = await keyManager.getAccountSummary(account!);
    if (!summary) {
      console.log(neonChalk.error(`${neonSymbols.cross} Account @${account} not found in wallet`));
      return;
    }

    console.log(neonChalk.glow(`${neonSymbols.diamond} Fetching account details...`));
    
    const spinner = neonSpinner('Connecting to Hive blockchain');
    
    try {
      const hiveClient = new HiveClient(keyManager);
      const accountData = await hiveClient.getAccount(account!);
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      if (!accountData) {
        console.log(neonChalk.warning(`${neonSymbols.warning} Account exists in wallet but not found on blockchain`));
      }
      
      console.log('');
      
      const roleColors = summary.roles.map(role => this.getRoleColor(role)(role));
      
      const infoDisplay = [
        `${neonChalk.cyan('ACCOUNT')}    ${neonSymbols.arrow} ${neonChalk.highlight('@' + account)}`,
        `${neonChalk.magenta('STATUS')}     ${neonSymbols.arrow} ${summary.isDefault ? neonChalk.success('Default') : neonChalk.white('Available')}`,
        `${neonChalk.electric('KEYS')}       ${neonSymbols.arrow} ${roleColors.join(', ')}`,
        accountData ? `${neonChalk.orange('BLOCKCHAIN')} ${neonSymbols.arrow} ${neonChalk.success('Verified')}` : `${neonChalk.orange('BLOCKCHAIN')} ${neonSymbols.arrow} ${neonChalk.warning('Not found')}`,
        ``,
        `${neonChalk.darkCyan('Local wallet contains ' + summary.keyCount + ' key(s) for this account')}`
      ].join('\n');
      
      console.log(createNeonBox(infoDisplay, `${neonSymbols.star} @${account.toUpperCase()} INFO ${neonSymbols.star}`));
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.warning(`${neonSymbols.warning} Could not verify on blockchain: ${error instanceof Error ? error.message : 'Unknown error'}`));
      
      const roleColors = summary.roles.map(role => this.getRoleColor(role)(role));
      
      const infoDisplay = [
        `${neonChalk.cyan('ACCOUNT')}    ${neonSymbols.arrow} ${neonChalk.highlight('@' + account)}`,
        `${neonChalk.magenta('STATUS')}     ${neonSymbols.arrow} ${summary.isDefault ? neonChalk.success('Default') : neonChalk.white('Available')}`,
        `${neonChalk.electric('KEYS')}       ${neonSymbols.arrow} ${roleColors.join(', ')}`,
        `${neonChalk.orange('BLOCKCHAIN')} ${neonSymbols.arrow} ${neonChalk.warning('Connection failed')}`,
        ``,
        `${neonChalk.darkCyan('Local wallet contains ' + summary.keyCount + ' key(s) for this account')}`
      ].join('\n');
      
      console.log(createNeonBox(infoDisplay, `${neonSymbols.star} @${account.toUpperCase()} INFO ${neonSymbols.star}`));
    }
  }

  private async removeAccount(keyManager: KeyManager, account?: string, force: boolean = false): Promise<void> {
    if (!account) {
      const accounts = await keyManager.listAccounts();
      if (accounts.length === 0) {
        console.log(neonChalk.warning('No accounts found in wallet'));
        return;
      }

      const accountPrompt = await inquirer.prompt([{
        type: 'list',
        name: 'account',
        message: neonChalk.warning('Select account to remove:'),
        choices: accounts.map(acc => `@${acc}`)
      }]);
      account = accountPrompt.account;
    }

    // Clean @ prefix if provided
    if (account!.startsWith('@')) {
      account = account!.substring(1);
    }

    const summary = await keyManager.getAccountSummary(account!);
    if (!summary) {
      console.log(neonChalk.error(`${neonSymbols.cross} Account @${account} not found in wallet`));
      return;
    }

    if (!force) {
      const confirmPrompt = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: neonChalk.warning(`Remove account @${account} and all its keys? This cannot be undone.`),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Operation cancelled'));
        return;
      }
    }

    try {
      // Remove all keys for this account
      for (const role of summary.roles) {
        await keyManager.removeKey(account!, role as any);
      }
      
      console.log(neonChalk.success(`${neonSymbols.check} Account @${account} removed from wallet`));
      
      const remaining = await keyManager.listAccounts();
      if (remaining.length > 0) {
        console.log(neonChalk.info(`Remaining accounts: ${remaining.map(a => '@' + a).join(', ')}`));
      } else {
        console.log(neonChalk.info('No accounts remaining in wallet'));
        console.log(neonChalk.info('Add account with: ') + neonChalk.highlight('beeline login <account>'));
      }
      
    } catch (error) {
      console.log(neonChalk.error(`${neonSymbols.cross} Removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private getRoleColor(role: string) {
    switch (role) {
      case 'owner': return neonChalk.warning;
      case 'active': return neonChalk.electric;
      case 'posting': return neonChalk.orange;
      case 'memo': return neonChalk.pink;
      default: return neonChalk.white;
    }
  }
}