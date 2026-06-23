import { Command, Flags } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class PowerDownCancel extends Command {
  static override description = 'Cancel an active power down (broadcasts a 0 VESTS withdraw_vesting)';

  static override examples = [
    `$ beeline powerdown-cancel`,
    `$ beeline powerdown-cancel --from @business`,
    `$ beeline powerdown-cancel --mock`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to cancel the power down for (defaults to default account)'
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

  public async run(): Promise<void> {
    const { flags } = await this.parse(PowerDownCancel);

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

    const hiveClient = new HiveClient(keyManager, flags.node);

    // Confirm there is actually a power down to cancel.
    try {
      const account = await hiveClient.getAccount(fromAccount);
      if (account) {
        const rate = parseFloat(account.vesting_withdraw_rate?.split(' ')[0] || '0');
        if (rate <= 0) {
          console.log(neonChalk.info(`${neonSymbols.info} @${fromAccount} has no active power down to cancel.`));
          console.log(neonChalk.info('Check status with: ') + neonChalk.highlight(`beeline powerdown-status ${fromAccount}`));
          return;
        }
      }
    } catch {
      // Non-fatal: if the lookup fails we still allow the cancel attempt.
    }

    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing to cancel power down...`));
    console.log('');

    const details = [
      `${neonChalk.cyan('ACCOUNT')}   ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.electric('ACTION')}    ${neonSymbols.arrow} ${neonChalk.white('Stop power down')} ${neonChalk.darkCyan('(0 VESTS withdraw rate)')}`,
      ``,
      `${neonChalk.darkCyan('Your Hive Power stays powered up; remaining weekly payments stop')}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].join('\n');

    console.log(createNeonBox(details, `${neonSymbols.star} CANCEL POWER DOWN ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate cancelling the power down?') :
          neonChalk.warning('Cancel the active power down?'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Cancellation aborted'));
        return;
      }
    }

    if (flags.mock) {
      console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating power down cancellation...`));
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
      // A withdraw_vesting of 0 VESTS stops an active power down.
      const txId = await hiveClient.powerDown(fromAccount, '0.000000', pin);

      stopSpinner(spinner);

      console.log(neonChalk.success(`${neonSymbols.check} Power down cancelled!`));
      console.log('');

      const successMessage = [
        `${neonChalk.glow('Power down cancellation broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('Account:')} @${fromAccount}`,
        `${neonChalk.electric('Withdraw Rate:')} 0.000000 VESTS/week`,
        ``,
        `${neonChalk.info('Your Hive Power remains powered up')}`
      ].join('\n');

      console.log(createNeonBox(successMessage, `${neonSymbols.star} POWER DOWN CANCELLED ${neonSymbols.star}`));

      if (pin) keyManager.scrubMemory(pin);

    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• No active power down to cancel'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));

      if (pin) keyManager.scrubMemory(pin);
    }
  }
}
