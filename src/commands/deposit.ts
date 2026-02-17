import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, validateAmount, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Deposit extends Command {
  static override description = 'Deposit HIVE or HBD to savings (HBD earns interest set by witnesses)';
  
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

    // Clean @ prefix if provided
    let fromAccount = cleanAccountName(flags.from);
    let toAccount = cleanAccountName(args.to);

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
    const amountResult = validateAmount(args.amount);
    if (!amountResult.valid) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid amount: ${(amountResult as { valid: false; error: string }).error}`));
      return;
    }
    const amount = amountResult.value;
    
    const currency = args.currency as 'HIVE' | 'HBD';
    const memo = args.memo || '';
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing savings deposit...`));
    console.log('');
    
    // Display deposit details
    const aprText = currency === 'HBD' ? neonChalk.green('HBD savings interest (rate set by witnesses)') : neonChalk.darkCyan('No interest');
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

    const pin = await promptForPin('active', activeKey.encrypted);
    
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
      
      stopSpinner(spinner);

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
        currency === 'HBD' ? `${neonChalk.cyan('Interest:')} HBD savings interest starts immediately` : '',
        ``,
        `${neonChalk.info('Deposit confirmed in ~3 seconds')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} SAVINGS DEPOSIT COMPLETE ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      stopSpinner(spinner);

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
  
  private async simulateDeposit(from: string, to: string, amount: number, currency: 'HIVE' | 'HBD', memo: string): Promise<void> {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating savings deposit...`));
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 1500));

    const mockTxId = generateMockTxId();

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
      currency === 'HBD' ? `${neonChalk.cyan('Interest:')} HBD savings interest would start immediately` : '',
      ``,
      `${neonChalk.info('Remove --mock flag to execute real deposit')}`
    ].filter(Boolean).join('\n');

    console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
  }
}