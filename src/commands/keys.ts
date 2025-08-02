import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import inquirer from 'inquirer';

export default class Keys extends Command {
  static override description = 'Manage your encrypted key vault with neon security';
  
  static override examples = [
    `$ beeline keys list`,
    `$ beeline keys import alice posting`,
    `$ beeline keys remove alice posting`,
    `$ beeline keys set-default alice`
  ];

  static override flags = {
    pin: Flags.boolean({
      char: 'p',
      description: 'use PIN encryption for key storage',
      default: true
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'force operation without confirmation',
      default: false
    })
  };

  static override args = {
    action: Args.string({
      description: 'action to perform',
      required: false,
      default: 'list',
      options: ['list', 'import', 'remove', 'set-default']
    }),
    account: Args.string({
      description: 'account name',
      required: false
    }),
    role: Args.string({
      description: 'key role (owner, active, posting, memo)',
      required: false,
      options: ['owner', 'active', 'posting', 'memo']
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Keys);
    const keyManager = new KeyManager();
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Accessing secure key vault...`));
    
    const spinner = neonSpinner('Initializing quantum encryption protocols');
    await keyManager.initialize();
    clearInterval(spinner);
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    
    console.log(neonChalk.success(`${neonSymbols.check} Key vault online`));
    console.log('');

    switch (args.action) {
      case 'list':
        await this.listKeys(keyManager);
        break;
      case 'import':
        await this.importKey(keyManager, args.account, args.role as any, flags.pin);
        break;
      case 'remove':
        await this.removeKey(keyManager, args.account, args.role as any, flags.force);
        break;
      case 'set-default':
        await this.setDefault(keyManager, args.account);
        break;
    }
  }

  private async listKeys(keyManager: KeyManager): Promise<void> {
    const accounts = await keyManager.listAccounts();
    const defaultAccount = keyManager.getDefaultAccount();

    if (accounts.length === 0) {
      console.log(createNeonBox(
        `${neonChalk.warning('No keys found in vault')}\n\n` +
        `Import keys with password login:\n` +
        `${neonChalk.highlight('beeline login <account>')}\n\n` +
        `Or import individual keys:\n` +
        `${neonChalk.highlight('beeline keys import <account> <role>')}`,
        `${neonSymbols.star} KEY VAULT ${neonSymbols.star}`
      ));
      return;
    }

    let keyDisplay = '';
    
    for (const account of accounts) {
      const keys = await keyManager.listKeys(account);
      const isDefault = account === defaultAccount;
      
      keyDisplay += `${neonChalk.glow('@' + account)}${isDefault ? neonChalk.yellow(' (default)') : ''}\n`;
      
      if (keys.length === 0) {
        keyDisplay += `${neonChalk.darkCyan('└─')} ${neonChalk.warning('No keys imported')}\n\n`;
        continue;
      }
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const isLast = i === keys.length - 1;
        const connector = isLast ? '└─' : '├─';
        const lockIcon = key.encrypted ? neonSymbols.diamond : neonSymbols.circle;
        const roleColor = this.getRoleColor(key.role);
        keyDisplay += `${neonChalk.darkCyan(connector)} ${neonChalk.cyan(lockIcon)} ${roleColor(key.role.padEnd(8))} ${neonSymbols.arrow} ${neonChalk.white(key.publicKey.substring(0, 20))}...\n`;
      }
      keyDisplay += '\n';
    }

    console.log(createNeonBox(keyDisplay.trim(), `${neonSymbols.star} SECURE KEY VAULT ${neonSymbols.star}`));
    
    // Legend and commands
    console.log('');
    console.log(neonChalk.darkCyan('Legend:'));
    console.log(neonChalk.darkCyan(`${neonSymbols.diamond} PIN encrypted  ${neonSymbols.circle} OS keychain only`));
    console.log('');
    console.log(neonChalk.info('Key management:'));
    console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Quick login: ${neonChalk.highlight('beeline login <account>')}`));
    console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Manual import: ${neonChalk.highlight('beeline keys import <account> <role>')}`));
    console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Account management: ${neonChalk.highlight('beeline accounts list')}`));
  }

  private async importKey(
    keyManager: KeyManager, 
    account?: string, 
    role?: 'owner' | 'active' | 'posting' | 'memo',
    usePin: boolean = true
  ): Promise<void> {
    if (!account) {
      const accountPrompt = await inquirer.prompt([{
        type: 'input',
        name: 'account',
        message: neonChalk.cyan('Account name:'),
        validate: (input: string) => input.length > 0 || 'Account name required'
      }]);
      account = accountPrompt.account;
    }

    if (!role) {
      const rolePrompt = await inquirer.prompt([{
        type: 'list',
        name: 'role',
        message: neonChalk.cyan('Key role:'),
        choices: [
          { name: `${neonChalk.orange('posting')} - Social interactions, voting`, value: 'posting' },
          { name: `${neonChalk.electric('active')} - Transfers, power operations`, value: 'active' },
          { name: `${neonChalk.pink('memo')} - Private messages`, value: 'memo' },
          { name: `${neonChalk.warning('owner')} - Account control (highest security)`, value: 'owner' }
        ]
      }]);
      role = rolePrompt.role;
    }

    const keyPrompt = await inquirer.prompt([{
      type: 'password',
      name: 'privateKey',
      message: neonChalk.cyan('Private key (WIF format):'),
      validate: (input: string) => input.length > 0 || 'Private key required'
    }]);

    let pin: string | undefined;
    if (usePin) {
      const pinPrompt = await inquirer.prompt([{
        type: 'password',
        name: 'pin',
        message: neonChalk.cyan('Set encryption PIN:'),
        validate: (input: string) => input.length >= 4 || 'PIN must be at least 4 characters'
      }]);
      pin = pinPrompt.pin;
    }

    try {
      const importSpinner = neonSpinner(`Importing ${role} key for ${account}`);
      
      await keyManager.importPrivateKey(account!, role!, keyPrompt.privateKey, pin);
      
      clearInterval(importSpinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.success(`${neonSymbols.check} Key imported successfully`));
      
      const statusMessage = [
        `${neonChalk.glow('Key secured in vault')}`,
        ``,
        `Account: ${neonChalk.highlight(account)}`,
        `Role: ${this.getRoleColor(role!)(role!)}`,
        `Encryption: ${usePin ? neonChalk.success('PIN protected') : neonChalk.warning('OS keychain only')}`,
        ``,
        `${neonChalk.info('Your key is now ready for blockchain operations')}`
      ].join('\n');
      
      console.log(createNeonBox(statusMessage, `${neonSymbols.star} IMPORT COMPLETE ${neonSymbols.star}`));
      
      // Memory scrubbing
      keyManager.scrubMemory(keyPrompt.privateKey);
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      clearInterval(neonSpinner(''));
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log(neonChalk.error(`${neonSymbols.cross} Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private async removeKey(
    keyManager: KeyManager, 
    account?: string, 
    role?: 'owner' | 'active' | 'posting' | 'memo',
    force: boolean = false
  ): Promise<void> {
    if (!account || !role) {
      console.log(neonChalk.error('Account and role required for key removal'));
      return;
    }

    if (!force) {
      const confirmPrompt = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: neonChalk.warning(`Remove ${role} key for ${account}? This cannot be undone.`),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Operation cancelled'));
        return;
      }
    }

    try {
      await keyManager.removeKey(account!, role!);
      console.log(neonChalk.success(`${neonSymbols.check} Key removed from vault`));
    } catch (error) {
      console.log(neonChalk.error(`${neonSymbols.cross} Removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private async setDefault(keyManager: KeyManager, account?: string): Promise<void> {
    if (!account) {
      const accounts = await keyManager.listAccounts();
      if (accounts.length === 0) {
        console.log(neonChalk.warning('No accounts found in vault'));
        return;
      }

      const accountPrompt = await inquirer.prompt([{
        type: 'list',
        name: 'account',
        message: neonChalk.cyan('Select default account:'),
        choices: accounts
      }]);
      account = accountPrompt.account;
    }

    try {
      await keyManager.setDefaultAccount(account!);
      console.log(neonChalk.success(`${neonSymbols.check} Default account set to ${neonChalk.highlight(account)}`));
    } catch (error) {
      console.log(neonChalk.error(`${neonSymbols.cross} Failed to set default: ${error instanceof Error ? error.message : 'Unknown error'}`));
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