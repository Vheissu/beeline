import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class PowerUp extends Command {
  static override description = 'Power up HIVE to Hive Power with cyberpunk style';
  
  static override examples = [
    `$ beeline powerup 10 HIVE`,
    `$ beeline powerup 5.000 HIVE @alice`,
    `$ beeline powerup 100 HIVE @alice --from @business`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to power up from (defaults to default account)'
    }),
    node: Flags.string({
      char: 'n',
      description: 'RPC node to use'
    }),
    confirm: Flags.boolean({
      char: 'y',
      description: 'skip confirmation prompt',
      default: false
    }),
    mock: Flags.boolean({
      char: 'm',
      description: 'simulate power up without broadcasting',
      default: false
    })
  };

  static override args = {
    amount: Args.string({
      description: 'amount of HIVE to power up',
      required: true
    }),
    currency: Args.string({
      description: 'currency (must be HIVE)',
      required: true,
      options: ['HIVE']
    }),
    to: Args.string({
      description: 'account to power up (defaults to from account)',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(PowerUp);
    
    const keyManager = new KeyManager();
    await keyManager.initialize();
    
    let fromAccount = flags.from;
    let toAccount = args.to;
    
    // Clean @ prefix if provided
    if (fromAccount?.startsWith('@')) {
      fromAccount = fromAccount.substring(1);
    }
    if (toAccount?.startsWith('@')) {
      toAccount = toAccount.substring(1);
    }
    
    // Use default account if no from account specified
    if (!fromAccount) {
      fromAccount = keyManager.getDefaultAccount();
      if (!fromAccount) {
        console.log(neonChalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(neonChalk.info('Import a key first with: ') + neonChalk.highlight('beeline keys import <account> active'));
        return;
      }
    }
    
    // If no to account specified, power up to self
    if (!toAccount) {
      toAccount = fromAccount;
    }
    
    // Validate currency
    if (args.currency !== 'HIVE') {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid currency: ${args.currency}. Power up only supports HIVE.`));
      return;
    }
    
    // Validate amount format
    const amount = parseFloat(args.amount);
    if (isNaN(amount) || amount <= 0) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid amount: ${args.amount}`));
      return;
    }
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing power up...`));
    console.log('');
    
    // Display power up details
    const powerUpDetails = [
      `${neonChalk.cyan('FROM')}     ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('TO')}       ${neonSymbols.arrow} ${neonChalk.highlight('@' + toAccount)}`,
      `${neonChalk.electric('AMOUNT')}   ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow('HIVE')}`,
      `${neonChalk.orange('RESULT')}   ${neonSymbols.arrow} ${neonChalk.white('+')} ${neonChalk.cyan('Hive Power')}`,
      ``,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].join('\n');
    
    console.log(createNeonBox(powerUpDetails, `${neonSymbols.star} POWER UP PREVIEW ${neonSymbols.star}`));
    console.log('');
    
    if (flags.mock) {
      console.log(neonChalk.warning(`${neonSymbols.star} Mock mode - transaction will NOT be broadcast`));
      console.log('');
    }
    
    // Confirmation prompt
    if (!flags.confirm) {
      const confirmPrompt = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: flags.mock ? 
          neonChalk.cyan('Simulate this power up?') : 
          neonChalk.warning('Execute this power up? This action cannot be undone.'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Power up cancelled'));
        return;
      }
    }
    
    if (flags.mock) {
      return this.simulatePowerUp(fromAccount, toAccount, amount);
    }
    
    // Get PIN for key decryption
    const keys = await keyManager.listKeys(fromAccount);
    const activeKey = keys.find(k => k.role === 'active');
    
    if (!activeKey) {
      console.log(neonChalk.error(`${neonSymbols.cross} Active key not found for account @${fromAccount}`));
      console.log(neonChalk.info('Import active key with: ') + neonChalk.highlight(`beeline keys import ${fromAccount} active`));
      return;
    }
    
    let pin: string | undefined;
    if (activeKey.encrypted) {
      const pinPrompt = await inquirer.prompt([{
        type: 'password',
        name: 'pin',
        message: neonChalk.cyan('Enter PIN to unlock active key:'),
        validate: (input: string) => input.length > 0 || 'PIN required'
      }]);
      pin = pinPrompt.pin;
    }
    
    const spinner = neonSpinner('Broadcasting to Hive blockchain');
    
    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      
      // Execute power up
      const txId = await hiveClient.powerUp(
        fromAccount,
        toAccount,
        amount.toFixed(3),
        pin
      );
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.success(`${neonSymbols.check} Power up successful!`));
      console.log('');
      
      const successMessage = [
        `${neonChalk.glow('Power up transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount}`,
        `${neonChalk.electric('To:')} @${toAccount}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} HIVE`,
        `${neonChalk.pink('Result:')} +${amount.toFixed(3)} Hive Power`,
        ``,
        `${neonChalk.info('Power up will be confirmed in ~3 seconds')}`
      ].join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} POWER UP COMPLETE ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Power up failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Insufficient HIVE balance'));
      console.log(neonChalk.darkCyan('• Invalid recipient account'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));
      
      // Memory scrubbing on error too
      if (pin) keyManager.scrubMemory(pin);
    }
  }
  
  private simulatePowerUp(from: string, to: string, amount: number): void {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating power up...`));
    console.log('');
    
    // Simulate some processing time
    setTimeout(() => {
      const mockTxId = '0x' + Math.random().toString(16).substring(2, 18);
      
      console.log(neonChalk.success(`${neonSymbols.check} Power up simulation complete!`));
      console.log('');
      
      const simulationMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL POWER UP')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('From:')} @${from}`,
        `${neonChalk.electric('To:')} @${to}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} HIVE`,
        `${neonChalk.pink('Mock Result:')} +${amount.toFixed(3)} Hive Power`,
        ``,
        `${neonChalk.info('Remove --mock flag to execute real power up')}`
      ].join('\n');
      
      console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
    }, 1500);
  }
}