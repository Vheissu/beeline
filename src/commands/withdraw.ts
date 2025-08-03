import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Withdraw extends Command {
  static override description = 'Withdraw HIVE or HBD from savings (3-day processing time) with cyberpunk style';
  
  static override examples = [
    `$ beeline withdraw 100 HIVE`,
    `$ beeline withdraw 50.000 HBD @alice`,
    `$ beeline withdraw 1000 HIVE @alice --from @business "Emergency withdrawal"`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to withdraw from (defaults to default account)'
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
      description: 'simulate withdrawal without broadcasting',
      default: false
    })
  };

  static override args = {
    amount: Args.string({
      description: 'amount to withdraw from savings',
      required: true
    }),
    currency: Args.string({
      description: 'currency (HIVE or HBD)',
      required: true,
      options: ['HIVE', 'HBD']
    }),
    to: Args.string({
      description: 'account to withdraw to (defaults to from account)',
      required: false
    }),
    memo: Args.string({
      description: 'withdrawal memo',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Withdraw);
    
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
    
    // If no to account specified, withdraw to self
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
    
    // Generate unique request ID (timestamp-based)
    const requestId = Date.now() % 1000000; // Keep it reasonable length
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing savings withdrawal...`));
    console.log('');
    
    // Display withdrawal details
    const withdrawalDetails = [
      `${neonChalk.cyan('FROM')}     ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)} ${neonChalk.darkCyan('(savings)')}`,
      `${neonChalk.magenta('TO')}       ${neonSymbols.arrow} ${neonChalk.highlight('@' + toAccount)}`,
      `${neonChalk.electric('AMOUNT')}   ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow(currency)}`,
      `${neonChalk.orange('REQ ID')}   ${neonSymbols.arrow} ${neonChalk.white(requestId.toString())}`,
      memo ? `${neonChalk.pink('MEMO')}     ${neonSymbols.arrow} ${neonChalk.white('"' + memo + '"')}` : '',
      ``,
      `${neonChalk.warning('⚠️  Withdrawal takes 3 DAYS to process')}`,
      `${neonChalk.info('💡 You can cancel during the 3-day waiting period')}`,
      `${neonChalk.info('💡 Use the request ID above to track/cancel')}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].filter(Boolean).join('\n');
    
    console.log(createNeonBox(withdrawalDetails, `${neonSymbols.star} SAVINGS WITHDRAWAL PREVIEW ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate this savings withdrawal?') : 
          neonChalk.warning('Execute this savings withdrawal? It will take 3 days to process.'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Savings withdrawal cancelled'));
        return;
      }
    }
    
    if (flags.mock) {
      return this.simulateWithdrawal(fromAccount, toAccount, amount, currency, requestId, memo);
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
      
      // Execute savings withdrawal
      const txId = await hiveClient.transferFromSavings(
        fromAccount,
        requestId,
        toAccount,
        amount.toFixed(3),
        currency,
        memo,
        pin
      );
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.success(`${neonSymbols.check} Savings withdrawal initiated!`));
      console.log('');
      
      const successMessage = [
        `${neonChalk.glow('Savings withdrawal transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount} (savings)`,
        `${neonChalk.electric('To:')} @${toAccount}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${currency}`,
        `${neonChalk.pink('Request ID:')} ${requestId}`,
        memo ? `${neonChalk.white('Memo:')} "${memo}"` : '',
        `${neonChalk.yellow('Status:')} Withdrawal initiated - processing for 3 days`,
        ``,
        `${neonChalk.info('Funds will be available in 3 days')}`,
        `${neonChalk.info('You can cancel before completion if needed')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} SAVINGS WITHDRAWAL INITIATED ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.error(`${neonSymbols.cross} Savings withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Insufficient savings balance'));
      console.log(neonChalk.darkCyan('• Invalid recipient account'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));
      console.log(neonChalk.darkCyan('• Duplicate request ID (try again)'));
      
      // Memory scrubbing on error too
      if (pin) keyManager.scrubMemory(pin);
    }
  }
  
  private simulateWithdrawal(from: string, to: string, amount: number, currency: 'HIVE' | 'HBD', requestId: number, memo: string): void {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating savings withdrawal...`));
    console.log('');
    
    // Simulate some processing time
    setTimeout(() => {
      const mockTxId = '0x' + Math.random().toString(16).substring(2, 18);
      
      console.log(neonChalk.success(`${neonSymbols.check} Savings withdrawal simulation complete!`));
      console.log('');
      
      const simulationMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL WITHDRAWAL')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('From:')} @${from} (savings)`,
        `${neonChalk.electric('To:')} @${to}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${currency}`,
        `${neonChalk.pink('Mock Request ID:')} ${requestId}`,
        memo ? `${neonChalk.white('Memo:')} "${memo}"` : '',
        `${neonChalk.yellow('Mock Status:')} Would process for 3 days`,
        ``,
        `${neonChalk.info('Remove --mock flag to execute real withdrawal')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
    }, 1500);
  }
}