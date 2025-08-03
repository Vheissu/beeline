import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class PowerDown extends Command {
  static override description = 'Power down Hive Power to liquid HIVE with cyberpunk style';
  
  static override examples = [
    `$ beeline powerdown 10 HP`,
    `$ beeline powerdown 5.000 HP --from @alice`,
    `$ beeline powerdown 100 VESTS --from @business`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to power down from (defaults to default account)'
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
      description: 'simulate power down without broadcasting',
      default: false
    })
  };

  static override args = {
    amount: Args.string({
      description: 'amount to power down',
      required: true
    }),
    unit: Args.string({
      description: 'unit (HP for Hive Power or VESTS for Vesting Shares)',
      required: true,
      options: ['HP', 'VESTS']
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(PowerDown);
    
    const keyManager = new KeyManager();
    await keyManager.initialize();
    
    let fromAccount = flags.from;
    
    // Clean @ prefix if provided
    if (fromAccount?.startsWith('@')) {
      fromAccount = fromAccount.substring(1);
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
    
    // Validate amount format
    const amount = parseFloat(args.amount);
    if (isNaN(amount) || amount <= 0) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid amount: ${args.amount}`));
      return;
    }
    
    const unit = args.unit as 'HP' | 'VESTS';
    let vestingAmount = amount;
    
    // Convert HP to VESTS if needed
    if (unit === 'HP') {
      try {
        const hiveClient = new HiveClient(keyManager, flags.node);
        vestingAmount = await hiveClient.convertHPToVests(amount);
      } catch (error) {
        console.log(neonChalk.error(`${neonSymbols.cross} Failed to convert HP to VESTS: ${error instanceof Error ? error.message : 'Unknown error'}`));
        return;
      }
    }
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing power down...`));
    console.log('');
    
    // Display power down details
    const powerDownDetails = [
      `${neonChalk.cyan('ACCOUNT')}   ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('AMOUNT')}    ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow(unit)}`,
      unit === 'HP' ? `${neonChalk.electric('VESTS')}     ${neonSymbols.arrow} ${neonChalk.white(vestingAmount.toFixed(3))} ${neonChalk.cyan('VESTS')}` : '',
      `${neonChalk.orange('DURATION')}  ${neonSymbols.arrow} ${neonChalk.white('13 weeks')} ${neonChalk.darkCyan('(weekly payments)')}`,
      ``,
      `${neonChalk.warning('⚠️  Power down is irreversible and takes 13 weeks to complete')}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].filter(Boolean).join('\n');
    
    console.log(createNeonBox(powerDownDetails, `${neonSymbols.star} POWER DOWN PREVIEW ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate this power down?') : 
          neonChalk.warning('Execute this power down? This will take 13 weeks to complete and cannot be undone.'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Power down cancelled'));
        return;
      }
    }
    
    if (flags.mock) {
      return this.simulatePowerDown(fromAccount, amount, unit, vestingAmount);
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
      
      // Execute power down
      const txId = await hiveClient.powerDown(
        fromAccount,
        vestingAmount.toFixed(6),
        pin
      );
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.success(`${neonSymbols.check} Power down started successfully!`));
      console.log('');
      
      const successMessage = [
        `${neonChalk.glow('Power down transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('Account:')} @${fromAccount}`,
        `${neonChalk.electric('Amount:')} ${amount.toFixed(3)} ${unit}`,
        `${neonChalk.orange('Vesting Shares:')} ${vestingAmount.toFixed(3)} VESTS`,
        `${neonChalk.pink('Duration:')} 13 weeks (weekly payments)`,
        ``,
        `${neonChalk.info('Power down will begin in ~3 seconds')}`
      ].join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} POWER DOWN STARTED ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Power down failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Insufficient Hive Power balance'));
      console.log(neonChalk.darkCyan('• Already powering down (only one power down at a time)'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));
      
      // Memory scrubbing on error too
      if (pin) keyManager.scrubMemory(pin);
    }
  }
  
  private simulatePowerDown(from: string, amount: number, unit: string, vestingAmount: number): void {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating power down...`));
    console.log('');
    
    // Simulate some processing time
    setTimeout(() => {
      const mockTxId = '0x' + Math.random().toString(16).substring(2, 18);
      
      console.log(neonChalk.success(`${neonSymbols.check} Power down simulation complete!`));
      console.log('');
      
      const simulationMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL POWER DOWN')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('Account:')} @${from}`,
        `${neonChalk.electric('Amount:')} ${amount.toFixed(3)} ${unit}`,
        `${neonChalk.orange('Mock Vesting Shares:')} ${vestingAmount.toFixed(3)} VESTS`,
        `${neonChalk.pink('Mock Duration:')} 13 weeks (weekly payments)`,
        ``,
        `${neonChalk.info('Remove --mock flag to execute real power down')}`
      ].join('\n');
      
      console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
    }, 1500);
  }
}