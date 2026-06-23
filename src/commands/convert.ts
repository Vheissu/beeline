import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, validateAmount, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Convert extends Command {
  static override description = 'Convert between HBD and HIVE (convert / collateralized_convert)';

  static override examples = [
    `$ beeline convert 10 HBD`,
    `$ beeline convert 10 HIVE`,
    `$ beeline convert 10 HBD --from @business`,
    `$ beeline convert 10 HBD --mock`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to convert from (defaults to default account)'
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
      description: 'simulate conversion without broadcasting',
      default: false
    })
  };

  static override args = {
    amount: Args.string({
      description: 'amount to convert',
      required: true
    }),
    currency: Args.string({
      description: 'currency to convert FROM (HBD converts to HIVE, HIVE converts to HBD)',
      required: true,
      options: ['HIVE', 'HBD']
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Convert);

    const keyManager = new KeyManager();
    await keyManager.initialize();

    let fromAccount = cleanAccountName(flags.from);
    if (!fromAccount) {
      fromAccount = keyManager.getDefaultAccount();
      if (!fromAccount) {
        console.log(neonChalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(neonChalk.info('Import a key first with: ') + neonChalk.highlight('beeline keys import <account> active'));
        return;
      }
    }

    const amountResult = validateAmount(args.amount);
    if (!amountResult.valid) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid amount: ${(amountResult as { valid: false; error: string }).error}`));
      return;
    }
    const amount = amountResult.value;
    const currency = args.currency as 'HIVE' | 'HBD';
    const targetCurrency = currency === 'HBD' ? 'HIVE' : 'HBD';

    // request_id is a uint32; a random value avoids collisions between conversions.
    const requestId = Math.floor(Math.random() * 0xffffffff);

    // The two conversion directions use different operations with different
    // settlement behaviour; surface that to the user.
    const settlementNote = currency === 'HBD'
      ? 'HBD -> HIVE settles after ~3.5 days at the median price feed (`convert`).'
      : 'HIVE -> HBD uses `collateralized_convert`: a partial payout is immediate, the rest settles after the conversion window.';

    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing conversion...`));
    console.log('');

    const details = [
      `${neonChalk.cyan('ACCOUNT')}   ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('CONVERT')}   ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow(currency)}`,
      `${neonChalk.electric('INTO')}      ${neonSymbols.arrow} ${neonChalk.white(targetCurrency)} ${neonChalk.darkCyan('(amount set by price feed)')}`,
      `${neonChalk.orange('REQ ID')}    ${neonSymbols.arrow} ${neonChalk.white(String(requestId))}`,
      ``,
      `${neonChalk.darkCyan(settlementNote)}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].join('\n');

    console.log(createNeonBox(details, `${neonSymbols.star} CONVERT PREVIEW ${neonSymbols.star}`));
    console.log('');

    if (flags.mock) {
      console.log(neonChalk.warning(`${neonSymbols.star} Mock mode - transaction will NOT be broadcast`));
      console.log('');
    }

    if (!flags.confirm) {
      const confirmPrompt = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: flags.mock ?
          neonChalk.cyan('Simulate this conversion?') :
          neonChalk.warning('Execute this conversion? It cannot be cancelled once broadcast.'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Conversion cancelled'));
        return;
      }
    }

    if (flags.mock) {
      console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating conversion...`));
      console.log('');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockTxId = generateMockTxId();
      console.log(neonChalk.success(`${neonSymbols.check} Conversion simulation complete!`));
      console.log('');
      const simMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL CONVERSION')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('Account:')} @${fromAccount}`,
        `${neonChalk.electric('Convert:')} ${amount.toFixed(3)} ${currency} -> ${targetCurrency}`,
        `${neonChalk.orange('Request ID:')} ${requestId}`,
        ``,
        `${neonChalk.info('Remove --mock flag to execute real conversion')}`
      ].join('\n');
      console.log(createNeonBox(simMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
      return;
    }

    const keys = await keyManager.listKeys(fromAccount);
    const activeKey = keys.find(k => k.role === 'active');

    if (!activeKey) {
      console.log(neonChalk.error(`${neonSymbols.cross} Active key not found for account @${fromAccount}`));
      console.log(neonChalk.info('Import active key with: ') + neonChalk.highlight(`beeline keys import ${fromAccount} active`));
      return;
    }

    const pin = await promptForPin('active', activeKey.encrypted);

    const spinner = neonSpinner('Broadcasting conversion to Hive blockchain');

    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      const txId = await hiveClient.convert(fromAccount, amount.toFixed(3), currency, requestId, pin);

      stopSpinner(spinner);

      console.log(neonChalk.success(`${neonSymbols.check} Conversion broadcast!`));
      console.log('');

      const successMessage = [
        `${neonChalk.glow('Conversion request broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('Account:')} @${fromAccount}`,
        `${neonChalk.electric('Converting:')} ${amount.toFixed(3)} ${currency} -> ${targetCurrency}`,
        `${neonChalk.orange('Request ID:')} ${requestId}`,
        ``,
        `${neonChalk.info(settlementNote)}`
      ].join('\n');

      console.log(createNeonBox(successMessage, `${neonSymbols.star} CONVERSION SUBMITTED ${neonSymbols.star}`));

      if (pin) keyManager.scrubMemory(pin);

    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan(`• Insufficient ${currency} balance`));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));

      if (pin) keyManager.scrubMemory(pin);
    }
  }
}
