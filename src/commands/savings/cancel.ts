import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, generateMockTxId } from '../../utils/neon.js';
import { KeyManager, promptForPin } from '../../utils/crypto.js';
import { HiveClient } from '../../utils/hive.js';
import inquirer from 'inquirer';

export default class SavingsCancel extends Command {
  static override description = 'Cancel a pending savings withdrawal (cancel_transfer_from_savings)';

  static override examples = [
    `$ beeline savings cancel 12345`,
    `$ beeline savings cancel 12345 --from @business`,
    `$ beeline savings cancel 12345 --mock`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account the withdrawal is from (defaults to default account)'
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
      description: 'simulate cancellation without broadcasting',
      default: false
    })
  };

  static override args = {
    requestId: Args.string({
      description: 'request ID of the pending savings withdrawal (see `beeline savings pending`)',
      required: true
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(SavingsCancel);

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

    // request_id is a uint32 integer.
    const requestId = Number(args.requestId);
    if (!Number.isInteger(requestId) || requestId < 0) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid request ID: ${args.requestId}. It must be a non-negative integer.`));
      console.log(neonChalk.info('List pending withdrawals with: ') + neonChalk.highlight(`beeline savings pending ${fromAccount}`));
      return;
    }

    const hiveClient = new HiveClient(keyManager, flags.node);

    // Confirm the request actually exists so we don't broadcast a no-op.
    let target;
    try {
      const withdrawals = await hiveClient.getSavingsWithdrawals(fromAccount);
      target = withdrawals.find(w => w.request_id === requestId);
    } catch {
      // Non-fatal: proceed without the lookup if the node call fails.
    }

    if (target === undefined) {
      console.log(neonChalk.warning(`${neonSymbols.warning} No pending savings withdrawal with request ID ${requestId} was found for @${fromAccount}.`));
      console.log(neonChalk.info('List pending withdrawals with: ') + neonChalk.highlight(`beeline savings pending ${fromAccount}`));
      return;
    }

    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing savings withdrawal cancellation...`));
    console.log('');

    const details = [
      `${neonChalk.cyan('ACCOUNT')}   ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.electric('REQ ID')}    ${neonSymbols.arrow} ${neonChalk.white(String(requestId))}`,
      `${neonChalk.orange('AMOUNT')}    ${neonSymbols.arrow} ${neonChalk.white(String(target.amount))} ${neonChalk.magenta('to')} @${target.to}`,
      ``,
      `${neonChalk.darkCyan('Cancelling returns the funds to your savings balance')}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].join('\n');

    console.log(createNeonBox(details, `${neonSymbols.star} CANCEL SAVINGS WITHDRAWAL ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate cancelling this withdrawal?') :
          neonChalk.warning('Cancel this savings withdrawal?'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Cancellation aborted'));
        return;
      }
    }

    if (flags.mock) {
      console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating cancellation...`));
      console.log('');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockTxId = generateMockTxId();
      console.log(neonChalk.success(`${neonSymbols.check} Cancellation simulation complete!`));
      console.log('');
      const simMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL CANCELLATION')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('Account:')} @${fromAccount}`,
        `${neonChalk.electric('Request ID:')} ${requestId}`,
        ``,
        `${neonChalk.info('Remove --mock flag to execute real cancellation')}`
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

    const spinner = neonSpinner('Broadcasting cancellation to Hive blockchain');

    try {
      const txId = await hiveClient.cancelSavingsWithdrawal(fromAccount, requestId, pin);

      stopSpinner(spinner);

      console.log(neonChalk.success(`${neonSymbols.check} Savings withdrawal cancelled!`));
      console.log('');

      const successMessage = [
        `${neonChalk.glow('Cancellation broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('Account:')} @${fromAccount}`,
        `${neonChalk.electric('Request ID:')} ${requestId}`,
        `${neonChalk.orange('Returned:')} ${target.amount}`,
        ``,
        `${neonChalk.info('Funds are back in your savings balance')}`
      ].join('\n');

      console.log(createNeonBox(successMessage, `${neonSymbols.star} WITHDRAWAL CANCELLED ${neonSymbols.star}`));

      if (pin) keyManager.scrubMemory(pin);

    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• The request ID no longer exists (already completed/cancelled)'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));

      if (pin) keyManager.scrubMemory(pin);
    }
  }
}
