import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Deposit extends Command {
  static override description = 'Deposit HIVE or HBD to savings with 20% APR and cyberpunk style';
  
  static override examples = [
    `$ beeline deposit 100 HIVE`,
    `$ beeline deposit 50.000 HBD @alice`,
    `$ beeline deposit 1000 HIVE @alice --from @business "Long term savings"`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to deposit from (defaults to default account)'
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
      description: 'simulate deposit without broadcasting',
      default: false
    })
  };

  static override args = {
    amount: Args.string({
      description: 'amount to deposit to savings',
      required: true
    }),
    currency: Args.string({
      description: 'currency (HIVE or HBD)',
      required: true,
      options: ['HIVE', 'HBD']
    }),
    to: Args.string({
      description: 'account to deposit to (defaults to from account)',
      required: false
    }),
    memo: Args.string({
      description: 'deposit memo',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Deposit);
    
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
    
    // If no to account specified, deposit to self
    if (!toAccount) {
      toAccount = fromAccount;
    }
    
    // Validate amount format
    const amount = parseFloat(args.amount);
    if (isNaN(amount) || amount <= 0) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid amount: ${args.amount}`));
      return;
    }
    
    const currency = args.currency as 'HIVE' | 'HBD';
    const memo = args.memo || '';
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing savings deposit...`));
    console.log('');
    
    // Display deposit details
    const aprText = currency === 'HBD' ? neonChalk.green('20% APR') : neonChalk.darkCyan('No interest');
    const depositDetails = [
      `${neonChalk.cyan('FROM')}     ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('TO')}       ${neonSymbols.arrow} ${neonChalk.highlight('@' + toAccount)}`,
      `${neonChalk.electric('AMOUNT')}   ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow(currency)}`,
      `${neonChalk.orange('INTEREST')} ${neonSymbols.arrow} ${aprText}`,
      memo ? `${neonChalk.pink('MEMO')}     ${neonSymbols.arrow} ${neonChalk.white('"' + memo + '"')}` : '',
      ``,
      `${neonChalk.info('💡 Savings deposits are instant')}`,
      `${neonChalk.info('💡 Withdrawals take 3 days to process')}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].filter(Boolean).join('\n');
    
    console.log(createNeonBox(depositDetails, `${neonSymbols.star} SAVINGS DEPOSIT PREVIEW ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate this savings deposit?') : 
          neonChalk.warning('Execute this savings deposit? Funds will be transferred to savings.'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Savings deposit cancelled'));
        return;
      }
    }
    
    if (flags.mock) {
      return this.simulateDeposit(fromAccount, toAccount, amount, currency, memo);
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
      
      // Execute savings deposit
      const txId = await hiveClient.transferToSavings(
        fromAccount,
        toAccount,
        amount.toFixed(3),
        currency,
        memo,
        pin
      );
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.success(`${neonSymbols.check} Savings deposit successful!`));
      console.log('');
      
      const successMessage = [
        `${neonChalk.glow('Savings deposit transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount}`,
        `${neonChalk.electric('To:')} @${toAccount}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${currency}`,
        memo ? `${neonChalk.pink('Memo:')} "${memo}"` : '',
        `${neonChalk.green('Status:')} Deposited to savings instantly`,
        currency === 'HBD' ? `${neonChalk.cyan('Interest:')} 20% APR starts immediately` : '',
        ``,
        `${neonChalk.info('Deposit confirmed in ~3 seconds')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} SAVINGS DEPOSIT COMPLETE ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Savings deposit failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Insufficient balance'));
      console.log(neonChalk.darkCyan('• Invalid recipient account'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));
      
      // Memory scrubbing on error too
      if (pin) keyManager.scrubMemory(pin);
    }
  }
  
  private simulateDeposit(from: string, to: string, amount: number, currency: 'HIVE' | 'HBD', memo: string): void {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating savings deposit...`));
    console.log('');
    
    // Simulate some processing time
    setTimeout(() => {
      const mockTxId = '0x' + Math.random().toString(16).substring(2, 18);
      
      console.log(neonChalk.success(`${neonSymbols.check} Savings deposit simulation complete!`));
      console.log('');
      
      const simulationMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL DEPOSIT')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('From:')} @${from}`,
        `${neonChalk.electric('To:')} @${to}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${currency}`,
        memo ? `${neonChalk.pink('Memo:')} "${memo}"` : '',
        `${neonChalk.green('Mock Status:')} Would be deposited to savings instantly`,
        currency === 'HBD' ? `${neonChalk.cyan('Mock Interest:')} 20% APR would start immediately` : '',
        ``,
        `${neonChalk.info('Remove --mock flag to execute real deposit')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
    }, 1500);
  }
}