import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName } from '../../utils/neon.js';
import { KeyManager } from '../../utils/crypto.js';
import { HiveClient } from '../../utils/hive.js';

export default class SavingsPending extends Command {
  static override description = 'List pending savings withdrawals (3-day unlock) for an account';

  static override examples = [
    `$ beeline savings pending`,
    `$ beeline savings pending alice`,
    `$ beeline savings pending alice --format json`
  ];

  static override flags = {
    node: Flags.string({
      char: 'n',
      description: 'RPC node to use'
    }),
    format: Flags.string({
      char: 'f',
      description: 'output format',
      options: ['table', 'json'],
      default: 'table'
    })
  };

  static override args = {
    account: Args.string({
      description: 'account to check pending savings withdrawals for',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(SavingsPending);

    const keyManager = new KeyManager();
    await keyManager.initialize();

    let account = cleanAccountName(args.account);
    if (!account) {
      account = keyManager.getDefaultAccount();
      if (!account) {
        console.log(neonChalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(neonChalk.info('Specify an account or import a key first'));
        return;
      }
    }

    console.log(neonChalk.glow(`${neonSymbols.diamond} Checking pending savings withdrawals...`));
    console.log('');

    const spinner = neonSpinner('Fetching pending savings withdrawals');

    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      const withdrawals = await hiveClient.getSavingsWithdrawals(account);

      stopSpinner(spinner);

      if (flags.format === 'json') {
        console.log(JSON.stringify({ account, count: withdrawals.length, withdrawals }, null, 2));
        return;
      }

      if (withdrawals.length === 0) {
        console.log(neonChalk.info(`${neonSymbols.info} No pending savings withdrawals for @${account}`));
        console.log('');
        console.log(neonChalk.info('Start one with: ') + neonChalk.highlight(`beeline withdraw <amount> <HIVE|HBD>`));
        return;
      }

      const lines: string[] = [
        `${neonChalk.darkCyan('Account: @' + account)}`,
        ``
      ];

      for (const w of withdrawals) {
        const complete = new Date(w.complete);
        const isReady = complete <= new Date();
        lines.push(`${neonChalk.electric('Request ID:')} ${neonChalk.white(String(w.request_id))}`);
        lines.push(`${neonChalk.orange('Amount:')} ${neonChalk.white(String(w.amount))}  ${neonChalk.magenta('To:')} @${w.to}`);
        if (w.memo) {
          lines.push(`${neonChalk.cyan('Memo:')} ${neonChalk.white(String(w.memo))}`);
        }
        lines.push(`${neonChalk.cyan('Completes:')} ${isReady ? neonChalk.success(complete.toLocaleString() + ' (ready)') : neonChalk.white(complete.toLocaleString())}`);
        lines.push(`${neonChalk.darkCyan('Cancel with:')} ${neonChalk.highlight(`beeline savings cancel ${w.request_id}`)}`);
        lines.push('');
      }

      console.log(createNeonBox(lines.join('\n').trimEnd(), `${neonSymbols.star} PENDING SAVINGS (${withdrawals.length}) ${neonSymbols.star}`));

    } catch (error) {
      stopSpinner(spinner);
      console.log(neonChalk.error(`${neonSymbols.cross} Failed to fetch pending savings withdrawals: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}
