import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Undelegate extends Command {
  static override description = 'Remove a Hive Power delegation to another account (sets it to 0)';

  static override examples = [
    `$ beeline undelegate @bob`,
    `$ beeline undelegate @bob --from @business`,
    `$ beeline undelegate @bob --mock`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account the delegation is from (defaults to default account)'
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
      description: 'simulate removal without broadcasting',
      default: false
    })
  };

  static override args = {
    delegatee: Args.string({
      description: 'account to remove the delegation from',
      required: true
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Undelegate);

    const keyManager = new KeyManager();
    await keyManager.initialize();

    let fromAccount = cleanAccountName(flags.from);
    const delegatee = cleanAccountName(args.delegatee);

    if (!fromAccount) {
      fromAccount = keyManager.getDefaultAccount();
      if (!fromAccount) {
        console.log(neonChalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(neonChalk.info('Import a key first with: ') + neonChalk.highlight('beeline keys import <account> active'));
        return;
      }
    }

    if (!delegatee) {
      console.log(neonChalk.error(`${neonSymbols.cross} A delegatee account is required`));
      return;
    }

    const hiveClient = new HiveClient(keyManager, flags.node);

    // Show the current delegation amount (if any) so the user knows what is being removed.
    let currentVests = 0;
    try {
      const delegations = await hiveClient.getOutgoingDelegations(fromAccount);
      const existing = delegations.find(d => d.delegatee === delegatee);
      currentVests = existing ? parseFloat(String(existing.vesting_shares).split(' ')[0]) : 0;
    } catch {
      // Non-fatal: the preview just won't show the current amount.
    }

    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing to remove delegation...`));
    console.log('');

    if (currentVests === 0) {
      console.log(neonChalk.warning(`${neonSymbols.warning} No active delegation from @${fromAccount} to @${delegatee} was found.`));
      console.log(neonChalk.info('The removal will still be broadcast as a 0 VESTS delegation if you continue.'));
      console.log('');
    }

    const details = [
      `${neonChalk.cyan('FROM')}     ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('TO')}       ${neonSymbols.arrow} ${neonChalk.highlight('@' + delegatee)}`,
      currentVests > 0 ? `${neonChalk.orange('CURRENT')}  ${neonSymbols.arrow} ${neonChalk.white(currentVests.toFixed(6))} ${neonChalk.cyan('VESTS')}` : '',
      `${neonChalk.electric('NEW')}      ${neonSymbols.arrow} ${neonChalk.white('0.000000')} ${neonChalk.cyan('VESTS')}`,
      ``,
      `${neonChalk.darkCyan('Removed Hive Power returns to your account after ~5 days')}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].filter(Boolean).join('\n');

    console.log(createNeonBox(details, `${neonSymbols.star} REMOVE DELEGATION ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate removing this delegation?') :
          neonChalk.warning('Remove this delegation?'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Delegation removal cancelled'));
        return;
      }
    }

    if (flags.mock) {
      console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating delegation removal...`));
      console.log('');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockTxId = generateMockTxId();
      console.log(neonChalk.success(`${neonSymbols.check} Removal simulation complete!`));
      console.log('');
      const simMessage = [
        `${neonChalk.warning('SIMULATION ONLY - NO REAL CHANGE')}`,
        ``,
        `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount}`,
        `${neonChalk.electric('To:')} @${delegatee}`,
        `${neonChalk.pink('New Delegation:')} 0.000000 VESTS`,
        ``,
        `${neonChalk.info('Remove --mock flag to execute real removal')}`
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

    const spinner = neonSpinner('Broadcasting delegation removal to Hive blockchain');

    try {
      const txId = await hiveClient.delegateVestingShares(
        fromAccount,
        delegatee,
        '0.000000',
        pin
      );

      stopSpinner(spinner);

      console.log(neonChalk.success(`${neonSymbols.check} Delegation removed!`));
      console.log('');

      const successMessage = [
        `${neonChalk.glow('Delegation removal broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount}`,
        `${neonChalk.electric('To:')} @${delegatee}`,
        `${neonChalk.pink('New Delegation:')} 0.000000 VESTS`,
        ``,
        `${neonChalk.info('Reclaimed Hive Power becomes available after ~5 days')}`
      ].join('\n');

      console.log(createNeonBox(successMessage, `${neonSymbols.star} DELEGATION REMOVED ${neonSymbols.star}`));

      if (pin) keyManager.scrubMemory(pin);

    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Delegation removal failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• No delegation existed to this account'));
      console.log(neonChalk.darkCyan('• Invalid delegatee account'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));

      if (pin) keyManager.scrubMemory(pin);
    }
  }
}
