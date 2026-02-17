import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, validateAmount, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Transfer extends Command {
  static override description = 'Transfer HIVE or HBD with cyberpunk style';
  
  static override examples = [
    `$ beeline transfer @alice 10 HIVE "Hello!"`,
    `$ beeline transfer @bob 5.000 HBD`,
    `$ beeline transfer @charlie 1.000 HIVE --from @alice`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to send from (defaults to default account)'
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
      description: 'simulate transfer without broadcasting',
      default: false
    })
  };

  static override args = {
    to: Args.string({
      description: 'recipient account name',
      required: true
    }),
    amount: Args.string({
      description: 'amount to transfer',
      required: true
    }),
    currency: Args.string({
      description: 'currency (HIVE or HBD)',
      required: true,
      options: ['HIVE', 'HBD']
    }),
    memo: Args.string({
      description: 'transfer memo',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Transfer);

    const keyManager = new KeyManager();
    await keyManager.initialize();

    // Clean @ prefix if provided
    let fromAccount = cleanAccountName(flags.from);
    const toAccount = cleanAccountName(args.to)!;

    // Use default account if no from account specified
    if (!fromAccount) {
      fromAccount = keyManager.getDefaultAccount();
      if (!fromAccount) {
        console.log(neonChalk.warning(`${neonSymbols.cross} No sender account specified and no default account set`));
        console.log(neonChalk.info('Import a key first with: ') + neonChalk.highlight('beeline keys import <account> active'));
        return;
      }
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
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing transfer...`));
    console.log('');
    
    // Display transfer details
    const transferDetails = [
      `${neonChalk.cyan('FROM')}     ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('TO')}       ${neonSymbols.arrow} ${neonChalk.highlight('@' + toAccount)}`,
      `${neonChalk.electric('AMOUNT')}   ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow(currency)}`,
      memo ? `${neonChalk.orange('MEMO')}     ${neonSymbols.arrow} ${neonChalk.white('"' + memo + '"')}` : '',
      ``,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].filter(Boolean).join('\n');
    
    console.log(createNeonBox(transferDetails, `${neonSymbols.star} TRANSFER PREVIEW ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate this transfer?') : 
          neonChalk.warning('Execute this transfer? This action cannot be undone.'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Transfer cancelled'));
        return;
      }
    }
    
    if (flags.mock) {
      return this.simulateTransfer(fromAccount, toAccount, amount, currency, memo);
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
      
      // Execute transfer
      const txId = await hiveClient.transfer(
        fromAccount,
        toAccount,
        amount.toFixed(3),
        currency,
        memo,
        pin
      );
      
      stopSpinner(spinner);

      console.log(neonChalk.success(`${neonSymbols.check} Transfer successful!`));
      console.log('');
      
      const successMessage = [
        `${neonChalk.glow('Transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount}`,
        `${neonChalk.electric('To:')} @${toAccount}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${currency}`,
        memo ? `${neonChalk.pink('Memo:')} "${memo}"` : '',
        ``,
        `${neonChalk.info('Transaction will be confirmed in ~3 seconds')}`
      ].filter(Boolean).join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} TRANSFER COMPLETE ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
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
  
  private async simulateTransfer(from: string, to: string, amount: number, currency: 'HIVE' | 'HBD', memo: string): Promise<void> {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating transfer...`));
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 1500));

    const mockTxId = generateMockTxId();

    console.log(neonChalk.success(`${neonSymbols.check} Transfer simulation complete!`));
    console.log('');

    const simulationMessage = [
      `${neonChalk.warning('SIMULATION ONLY - NO REAL TRANSFER')}`,
      ``,
      `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
      `${neonChalk.magenta('From:')} @${from}`,
      `${neonChalk.electric('To:')} @${to}`,
      `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${currency}`,
      memo ? `${neonChalk.pink('Memo:')} "${memo}"` : '',
      ``,
      `${neonChalk.info('Remove --mock flag to execute real transfer')}`
    ].filter(Boolean).join('\n');

    console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
  }
}