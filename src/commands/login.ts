import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, createNeonBanner, createNeonGrid } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Login extends Command {
  static override description = 'Login to your Hive account with master password';
  
  static override examples = [
    `$ beeline login alice`,
    `$ beeline login alice --roles posting,active`,
    `$ beeline login alice --no-pin`
  ];

  static override flags = {
    roles: Flags.string({
      char: 'r',
      description: 'key roles to import (comma-separated)',
      default: 'posting,active,memo'
    }),
    pin: Flags.boolean({
      char: 'p',
      description: 'use PIN encryption for key storage',
      default: true,
      allowNo: true
    }),
    verify: Flags.boolean({
      char: 'v',
      description: 'verify account exists on blockchain',
      default: true,
      allowNo: true
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'overwrite existing keys without confirmation',
      default: false
    })
  };

  static override args = {
    account: Args.string({
      description: 'Hive account name',
      required: true
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Login);
    
    let account = args.account;
    
    // Clean @ prefix if provided
    if (account.startsWith('@')) {
      account = account.substring(1);
    }
    
    const keyManager = new KeyManager();
    await keyManager.initialize();
    
    // Check if this is the first time using beeline
    const existingAccounts = await keyManager.listAccounts();
    const isFirstTime = existingAccounts.length === 0;
    
    if (isFirstTime) {
      await this.showWelcomeSequence();
    }
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Initiating secure login for ${neonChalk.highlight('@' + account)}...`));
    console.log('');
    
    // Check if account already exists
    const hasAccount = await keyManager.hasAccount(account);
    if (hasAccount && !flags.force) {
      const confirmPrompt = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: neonChalk.warning(`Account @${account} already exists in vault. Overwrite keys?`),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Login cancelled'));
        return;
      }
    }
    
    // Parse roles
    const requestedRoles = flags.roles.split(',').map(r => r.trim()) as ('owner' | 'active' | 'posting' | 'memo')[];
    const validRoles = ['owner', 'active', 'posting', 'memo'];
    const roles = requestedRoles.filter(role => validRoles.includes(role));
    
    if (roles.length === 0) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid roles specified. Valid roles: owner, active, posting, memo`));
      return;
    }
    
    // Verify account exists on blockchain
    if (flags.verify) {
      const verifySpinner = neonSpinner('Verifying account on Hive blockchain');
      
      try {
        const hiveClient = new HiveClient(keyManager);
        const accountData = await hiveClient.getAccount(account);
        
        clearInterval(verifySpinner);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        if (!accountData) {
          console.log(neonChalk.error(`${neonSymbols.cross} Account @${account} not found on Hive blockchain`));
          console.log(neonChalk.info('Use --no-verify to skip this check'));
          return;
        }
        
        console.log(neonChalk.success(`${neonSymbols.check} Account verified on blockchain`));
        console.log('');
      } catch (error) {
        clearInterval(verifySpinner);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        console.log(neonChalk.warning(`${neonSymbols.warning} Could not verify account: ${error instanceof Error ? error.message : 'Unknown error'}`));
        console.log(neonChalk.info('Proceeding anyway...'));
        console.log('');
      }
    }
    
    // Get master password
    const passwordPrompt = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: neonChalk.cyan('Master password:'),
      validate: (input: string) => input.length > 0 || 'Password required'
    }]);
    
    // Get PIN if enabled
    let pin: string | undefined;
    if (flags.pin) {
      const pinPrompt = await inquirer.prompt([{
        type: 'password',
        name: 'pin',
        message: neonChalk.cyan('Set encryption PIN (4+ characters):'),
        validate: (input: string) => input.length >= 4 || 'PIN must be at least 4 characters'
      }]);
      pin = pinPrompt.pin;
    }
    
    // Display login details
    const loginDetails = [
      `${neonChalk.cyan('ACCOUNT')}   ${neonSymbols.arrow} ${neonChalk.highlight('@' + account)}`,
      `${neonChalk.magenta('ROLES')}     ${neonSymbols.arrow} ${neonChalk.white(roles.join(', '))}`,
      `${neonChalk.electric('SECURITY')} ${neonSymbols.arrow} ${flags.pin ? neonChalk.success('PIN protected') : neonChalk.warning('OS keychain only')}`,
      ``,
      `${neonChalk.darkCyan('Keys will be derived from your master password')}`
    ].join('\n');
    
    console.log(createNeonBox(loginDetails, `${neonSymbols.star} LOGIN CONFIGURATION ${neonSymbols.star}`));
    console.log('');
    
    const loginSpinner = neonSpinner('Deriving keys from master password');
    
    try {
      // Perform login with password derivation
      await keyManager.loginWithPassword(account, passwordPrompt.password, pin, roles);
      
      clearInterval(loginSpinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.success(`${neonSymbols.check} Login successful!`));
      console.log('');
      
      // Get account summary
      const summary = await keyManager.getAccountSummary(account);
      
      const successMessage = [
        `${neonChalk.glow('Welcome to the neon grid, runner')}`,
        ``,
        `${neonChalk.cyan('Account:')} @${account}`,
        `${neonChalk.magenta('Keys imported:')} ${summary?.roles.join(', ')}`,
        `${neonChalk.electric('Security level:')} ${flags.pin ? 'Maximum (PIN + OS keychain)' : 'Standard (OS keychain)'}`,
        summary?.isDefault ? `${neonChalk.success('Set as default account')}` : '',
        ``,
        `${neonChalk.info('Your wallet is ready for blockchain operations')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} LOGIN COMPLETE ${neonSymbols.star}`));
      console.log('');
      
      // Next steps
      if (isFirstTime) {
        console.log(neonChalk.pulse('🎉 Your wallet is now ready! Next steps:'));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Check balance: ${neonChalk.highlight('beeline balance')}`));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Test safely: ${neonChalk.highlight('beeline balance --mock')}`));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Send transfer: ${neonChalk.highlight('beeline transfer @recipient 1 HIVE')}`));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Add more accounts: ${neonChalk.highlight('beeline login <account>')}`));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} View help: ${neonChalk.highlight('beeline --help')}`));
      } else {
        console.log(neonChalk.pulse('Next steps:'));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Check balance: ${neonChalk.highlight('beeline balance')}`));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Send transfer: ${neonChalk.highlight('beeline transfer @recipient 1 HIVE')}`));
        console.log(neonChalk.darkCyan(`${neonSymbols.bullet} Manage accounts: ${neonChalk.highlight('beeline accounts list')}`));
      }
      
      // Memory scrubbing
      keyManager.scrubMemory(passwordPrompt.password);
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      clearInterval(loginSpinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Incorrect master password'));
      console.log(neonChalk.darkCyan('• Invalid account name'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      
      // Memory scrubbing on error
      keyManager.scrubMemory(passwordPrompt.password);
      if (pin) keyManager.scrubMemory(pin);
    }
  }

  private async showWelcomeSequence(): Promise<void> {
    console.clear();
    
    // Display cyberpunk grid
    console.log(createNeonGrid(80));
    
    // Main banner
    const banner = await createNeonBanner('BEELINE');
    console.log(banner);
    
    // Tagline
    console.log(neonChalk.accent('    ╔════════════════════════════════════════════════════════════════════╗'));
    console.log(neonChalk.accent('    ║  ') + neonChalk.glow('H I V E   T E R M I N A L   W A L L E T') + neonChalk.accent('  ·  ') + neonChalk.pulse('N E O N  G R I D') + neonChalk.accent('     ║'));
    console.log(neonChalk.accent('    ╚════════════════════════════════════════════════════════════════════╝'));
    
    console.log('');
    
    // Welcome message
    const welcomeMessage = [
      `${neonChalk.glow('Welcome to the neon grid, runner.')}`,
      ``,
      `${neonChalk.cyan('Your cyberpunk terminal wallet is initializing...')}`,
      ``,
      `${neonChalk.info('Security features:')}`,
      `${neonChalk.darkCyan('├─')} ${neonChalk.success('PIN encryption')} for maximum security`,
      `${neonChalk.darkCyan('├─')} ${neonChalk.success('OS keychain')} integration`,
      `${neonChalk.darkCyan('├─')} ${neonChalk.success('Memory scrubbing')} prevents key recovery`,
      `${neonChalk.darkCyan('└─')} ${neonChalk.success('Mock mode')} for safe testing`,
      ``,
      `${neonChalk.pulse('Type, sign, rule the chain.')}`
    ].join('\n');
    
    console.log(createNeonBox(welcomeMessage, `${neonSymbols.star} WALLET INITIALIZATION ${neonSymbols.star}`));
    console.log('');
    
    // Brief pause for effect
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}