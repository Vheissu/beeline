import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';

export default class Delegations extends Command {
  static override description = 'Show outgoing and incoming Hive Power delegations for an account';

  static override examples = [
    `$ beeline delegations`,
    `$ beeline delegations alice`,
    `$ beeline delegations alice --format json`
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
      description: 'account to inspect delegations for',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Delegations);

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

    console.log(neonChalk.glow(`${neonSymbols.diamond} Fetching delegations...`));
    console.log('');

    const spinner = neonSpinner('Fetching delegation data');

    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      const [accountData, outgoing] = await Promise.all([
        hiveClient.getAccount(account),
        hiveClient.getOutgoingDelegations(account)
      ]);

      if (!accountData) {
        stopSpinner(spinner);
        console.log(neonChalk.error(`${neonSymbols.cross} Account @${account} not found`));
        return;
      }

      // One conversion call gives the HP-per-VESTS ratio; apply it locally to
      // every row to avoid one network round-trip per delegation.
      const hpPerVest = await hiveClient.convertVestsToHP(1);
      stopSpinner(spinner);

      const toVests = (asset: string): number => parseFloat(String(asset).split(' ')[0]) || 0;
      const receivedVests = toVests(accountData.received_vesting_shares);
      const outgoingTotalVests = outgoing.reduce((sum, d) => sum + toVests(d.vesting_shares), 0);

      if (flags.format === 'json') {
        console.log(JSON.stringify({
          account,
          incoming: {
            received_vesting_shares: accountData.received_vesting_shares,
            received_hp: receivedVests * hpPerVest
          },
          outgoing: {
            count: outgoing.length,
            total_vesting_shares: outgoingTotalVests,
            total_hp: outgoingTotalVests * hpPerVest,
            delegations: outgoing.map(d => ({
              delegatee: d.delegatee,
              vesting_shares: d.vesting_shares,
              hp: toVests(d.vesting_shares) * hpPerVest
            }))
          }
        }, null, 2));
        return;
      }

      const lines: string[] = [
        `${neonChalk.darkCyan('Account: @' + account)}`,
        ``,
        `${neonChalk.electric('Incoming (received):')} ${neonChalk.white((receivedVests * hpPerVest).toFixed(3))} HP`,
        `${neonChalk.orange('Outgoing total:')} ${neonChalk.white((outgoingTotalVests * hpPerVest).toFixed(3))} HP ${neonChalk.darkCyan(`across ${outgoing.length} delegation${outgoing.length === 1 ? '' : 's'}`)}`
      ];

      if (outgoing.length > 0) {
        lines.push('');
        lines.push(neonChalk.magenta('Outgoing delegations:'));
        for (const d of outgoing) {
          const hp = toVests(d.vesting_shares) * hpPerVest;
          lines.push(`  ${neonSymbols.arrow} @${d.delegatee}: ${neonChalk.white(hp.toFixed(3))} HP ${neonChalk.darkCyan(`(${toVests(d.vesting_shares).toFixed(6)} VESTS)`)}`);
        }
      }

      console.log(createNeonBox(lines.join('\n'), `${neonSymbols.star} DELEGATIONS ${neonSymbols.star}`));

      if (outgoing.length > 0) {
        console.log('');
        console.log(neonChalk.info(`${neonSymbols.bullet} Remove a delegation with: ${neonChalk.highlight('beeline undelegate @<account>')}`));
      }

    } catch (error) {
      stopSpinner(spinner);
      console.log(neonChalk.error(`${neonSymbols.cross} Failed to fetch delegations: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}
