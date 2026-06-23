import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, validateAmount, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Delegate extends Command {
  static override description = 'Delegate Hive Power to another account (delegate_vesting_shares)';

  static override examples = [
    `$ beeline delegate @bob 500 HP`,
    `$ beeline delegate @bob 1000000 VESTS`,
    `$ beeline delegate @bob 500 HP --from @business`,
    `$ beeline delegate @bob 500 HP --mock`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to delegate from (defaults to default account)'
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
      description: 'simulate delegation without broadcasting',
      default: false
    })
  };

  static override args = {
    delegatee: Args.string({
      description: 'account to delegate to',
      required: true
    }),
    amount: Args.string({
      description: 'amount to delegate',
      required: true
    }),
    unit: Args.string({
      description: 'unit (HP for Hive Power or VESTS for Vesting Shares)',
      required: false,
      options: ['HP', 'VESTS'],
      default: 'HP'
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Delegate);

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

    if (delegatee === fromAccount) {
      console.log(neonChalk.error(`${neonSymbols.cross} You cannot delegate to yourself`));
      return;
    }

    const amountResult = validateAmount(args.amount);
    if (!amountResult.valid) {
      console.log(neonChalk.error(`${neonSymbols.cross} Invalid amount: ${(amountResult as { valid: false; error: string }).error}`));
      return;
    }
    const amount = amountResult.value;
    const unit = args.unit as 'HP' | 'VESTS';

    // Resolve the VESTS amount that will actually be broadcast.
    let vestingAmount = amount;
    const hiveClient = new HiveClient(keyManager, flags.node);
    if (unit === 'HP') {
      try {
        vestingAmount = await hiveClient.convertHPToVests(amount);
      } catch (error) {
        console.log(neonChalk.error(`${neonSymbols.cross} Failed to convert HP to VESTS: ${error instanceof Error ? error.message : 'Unknown error'}`));
        return;
      }
    }

    console.log(neonChalk.glow(`${neonSymbols.diamond} Preparing delegation...`));
    console.log('');

    const delegateDetails = [
      `${neonChalk.cyan('FROM')}     ${neonSymbols.arrow} ${neonChalk.highlight('@' + fromAccount)}`,
      `${neonChalk.magenta('TO')}       ${neonSymbols.arrow} ${neonChalk.highlight('@' + delegatee)}`,
      `${neonChalk.electric('AMOUNT')}   ${neonSymbols.arrow} ${neonChalk.white(amount.toFixed(3))} ${neonChalk.yellow(unit)}`,
      unit === 'HP' ? `${neonChalk.orange('VESTS')}    ${neonSymbols.arrow} ${neonChalk.white(vestingAmount.toFixed(6))} ${neonChalk.cyan('VESTS')}` : '',
      ``,
      `${neonChalk.darkCyan('Delegations can be reduced or removed with: ')}${neonChalk.highlight(`beeline undelegate @${delegatee}`)}`,
      `${neonChalk.darkCyan('Transaction will be signed with your active key')}`
    ].filter(Boolean).join('\n');

    console.log(createNeonBox(delegateDetails, `${neonSymbols.star} DELEGATION PREVIEW ${neonSymbols.star}`));
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
          neonChalk.cyan('Simulate this delegation?') :
          neonChalk.warning('Execute this delegation?'),
        default: false
      }]);

      if (!confirmPrompt.confirm) {
        console.log(neonChalk.info('Delegation cancelled'));
        return;
      }
    }

    if (flags.mock) {
      return this.simulateDelegation(fromAccount, delegatee, amount, unit, vestingAmount);
    }

    const keys = await keyManager.listKeys(fromAccount);
    const activeKey = keys.find(k => k.role === 'active');

    if (!activeKey) {
      console.log(neonChalk.error(`${neonSymbols.cross} Active key not found for account @${fromAccount}`));
      console.log(neonChalk.info('Import active key with: ') + neonChalk.highlight(`beeline keys import ${fromAccount} active`));
      return;
    }

    const pin = await promptForPin('active', activeKey.encrypted);

    const spinner = neonSpinner('Broadcasting delegation to Hive blockchain');

    try {
      const txId = await hiveClient.delegateVestingShares(
        fromAccount,
        delegatee,
        vestingAmount.toFixed(6),
        pin
      );

      stopSpinner(spinner);

      console.log(neonChalk.success(`${neonSymbols.check} Delegation successful!`));
      console.log('');

      const successMessage = [
        `${neonChalk.glow('Delegation transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('From:')} @${fromAccount}`,
        `${neonChalk.electric('To:')} @${delegatee}`,
        `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${unit}`,
        `${neonChalk.pink('Vesting Shares:')} ${vestingAmount.toFixed(6)} VESTS`,
        ``,
        `${neonChalk.info('Delegation will be confirmed in ~3 seconds')}`
      ].join('\n');

      console.log(createNeonBox(successMessage, `${neonSymbols.star} DELEGATION COMPLETE ${neonSymbols.star}`));

      if (pin) keyManager.scrubMemory(pin);

    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Delegation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• Insufficient Hive Power available to delegate'));
      console.log(neonChalk.darkCyan('• Delegation below the minimum allowed amount'));
      console.log(neonChalk.darkCyan('• Invalid delegatee account'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));

      if (pin) keyManager.scrubMemory(pin);
    }
  }

  private async simulateDelegation(from: string, to: string, amount: number, unit: string, vestingAmount: number): Promise<void> {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating delegation...`));
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 1500));

    const mockTxId = generateMockTxId();

    console.log(neonChalk.success(`${neonSymbols.check} Delegation simulation complete!`));
    console.log('');

    const simulationMessage = [
      `${neonChalk.warning('SIMULATION ONLY - NO REAL DELEGATION')}`,
      ``,
      `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
      `${neonChalk.magenta('From:')} @${from}`,
      `${neonChalk.electric('To:')} @${to}`,
      `${neonChalk.orange('Amount:')} ${amount.toFixed(3)} ${unit}`,
      `${neonChalk.pink('Mock Vesting Shares:')} ${vestingAmount.toFixed(6)} VESTS`,
      ``,
      `${neonChalk.info('Remove --mock flag to execute real delegation')}`
    ].join('\n');

    console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
  }
}
