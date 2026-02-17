import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner, stopSpinner, cleanAccountName, generateMockTxId } from '../utils/neon.js';
import { KeyManager, promptForPin } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Claim extends Command {
  static override description = 'Claim pending author, curation, and vesting rewards with cyberpunk style';
  
  static override examples = [
    `$ beeline claim`,
    `$ beeline claim alice`,
    `$ beeline claim alice --show-only`,
    `$ beeline claim alice --all`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to claim rewards from (defaults to default account)'
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
      description: 'simulate reward claiming without broadcasting',
      default: false
    }),
    'show-only': Flags.boolean({
      char: 's',
      description: 'only show available rewards without claiming',
      default: false
    }),
    all: Flags.boolean({
      char: 'a',
      description: 'claim all available rewards (HIVE, HBD, and VESTS)',
      default: false
    })
  };

  static override args = {
    account: Args.string({
      description: 'account to claim rewards for',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Claim);

    const keyManager = new KeyManager();
    await keyManager.initialize();

    // Clean @ prefix if provided
    let account = cleanAccountName(args.account) || cleanAccountName(flags.from);

    // Use default account if no account specified
    if (!account) {
      account = keyManager.getDefaultAccount();
      if (!account) {
        console.log(neonChalk.warning(`${neonSymbols.cross} No account specified and no default account set`));
        console.log(neonChalk.info('Import a key first with: ') + neonChalk.highlight('beeline keys import <account> posting'));
        return;
      }
    }
    
    console.log(neonChalk.glow(`${neonSymbols.diamond} Checking available rewards...`));
    console.log('');
    
    const spinner = neonSpinner('Fetching reward balances');
    
    try {
      const hiveClient = new HiveClient(keyManager, flags.node);
      const accountData = await hiveClient.getAccount(account);
      
      stopSpinner(spinner);

      if (!accountData) {
        console.log(neonChalk.error(`${neonSymbols.cross} Account @${account} not found`));
        return;
      }
      
      // Extract reward balances from account data
      const rewardHiveRaw = accountData.reward_hive_balance?.split(' ')[0] || '0.000';
      const rewardHbdRaw = accountData.reward_hbd_balance?.split(' ')[0] || '0.000';
      const rewardVestsRaw = accountData.reward_vesting_balance?.split(' ')[0] || '0.000000';
      
      // Parse for display and logic
      const rewardHive = parseFloat(rewardHiveRaw);
      const rewardHbd = parseFloat(rewardHbdRaw);
      const rewardVests = parseFloat(rewardVestsRaw);
      
      // Check if there are any rewards to claim
      const hasRewards = rewardHive > 0 || rewardHbd > 0 || rewardVests > 0;
      
      if (!hasRewards) {
        console.log(neonChalk.info(`${neonSymbols.info} No pending rewards for @${account}`));
        console.log('');
        const noRewardsMessage = [
          `${neonChalk.darkCyan('Account checked: @' + account)}`,
          ``,
          `${neonChalk.orange('Author Rewards:')} 0.000 HIVE`,
          `${neonChalk.cyan('Curation Rewards:')} 0.000 HBD`,
          `${neonChalk.electric('Vesting Rewards:')} 0.000 VESTS`,
          ``,
          `${neonChalk.info('💡 Rewards appear here after posts and votes')}`
        ].join('\n');
        
        console.log(createNeonBox(noRewardsMessage, `${neonSymbols.star} REWARD STATUS ${neonSymbols.star}`));
        return;
      }
      
      // Display available rewards
      const rewardDetails = [
        `${neonChalk.darkCyan('Account: @' + account)}`,
        ``,
        `${neonChalk.orange('Author Rewards:')} ${neonChalk.white(rewardHive.toFixed(3))} ${neonChalk.yellow('HIVE')}`,
        `${neonChalk.cyan('Curation Rewards:')} ${neonChalk.white(rewardHbd.toFixed(3))} ${neonChalk.yellow('HBD')}`,
        `${neonChalk.electric('Vesting Rewards:')} ${neonChalk.white(rewardVests.toFixed(6))} ${neonChalk.yellow('VESTS')}`,
        ``,
        `${neonChalk.green('💰 Total value available to claim!')}`
      ].join('\n');
      
      console.log(createNeonBox(rewardDetails, `${neonSymbols.star} AVAILABLE REWARDS ${neonSymbols.star}`));
      console.log('');
      
      // If show-only flag, just return after showing
      if (flags['show-only']) {
        console.log(neonChalk.info('Use: ') + neonChalk.highlight(`beeline claim ${account}`) + ' to claim these rewards');
        return;
      }
      
      if (flags.mock) {
        console.log(neonChalk.warning(`${neonSymbols.star} Mock mode - transaction will NOT be broadcast`));
        console.log('');
      }
      
      // Confirmation prompt
      if (!flags.confirm && !flags.all) {
        const confirmPrompt = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: flags.mock ? 
            neonChalk.cyan('Simulate claiming these rewards?') : 
            neonChalk.warning('Claim all available rewards?'),
          default: true
        }]);

        if (!confirmPrompt.confirm) {
          console.log(neonChalk.info('Reward claiming cancelled'));
          return;
        }
      }
      
      if (flags.mock) {
        return this.simulateClaim(account, rewardHive, rewardHbd, rewardVests);
      }
      
      // Get PIN for key decryption (rewards require posting key)
      const keys = await keyManager.listKeys(account);
      const postingKey = keys.find(k => k.role === 'posting');

      if (!postingKey) {
        console.log(neonChalk.error(`${neonSymbols.cross} Posting key not found for account @${account}`));
        console.log(neonChalk.info('Import posting key with: ') + neonChalk.highlight(`beeline keys import ${account} posting`));
        return;
      }

      const pin = await promptForPin('posting', postingKey.encrypted);
      
      const claimSpinner = neonSpinner('Broadcasting reward claim to Hive blockchain');
      
      // Execute reward claim
      const txId = await hiveClient.claimRewards(
        account,
        rewardHive > 0 ? rewardHiveRaw : '0.000',
        rewardHbd > 0 ? rewardHbdRaw : '0.000', 
        rewardVests > 0 ? rewardVestsRaw : '0.000000',
        pin
      );
      
      stopSpinner(claimSpinner);

      console.log(neonChalk.success(`${neonSymbols.check} Rewards claimed successfully!`));
      console.log('');
      
      const successMessage = [
        `${neonChalk.glow('Reward claim transaction broadcast successfully')}`,
        ``,
        `${neonChalk.cyan('Transaction ID:')} ${neonChalk.highlight(txId)}`,
        `${neonChalk.magenta('Account:')} @${account}`,
        ``,
        `${neonChalk.orange('Claimed HIVE:')} ${rewardHive > 0 ? rewardHiveRaw : '0.000'} HIVE`,
        `${neonChalk.cyan('Claimed HBD:')} ${rewardHbd > 0 ? rewardHbdRaw : '0.000'} HBD`,
        `${neonChalk.electric('Claimed VESTS:')} ${rewardVests > 0 ? rewardVestsRaw : '0.000000'} VESTS`,
        ``,
        `${neonChalk.green('🎉 Rewards added to your balance!')}`,
        `${neonChalk.info('Claim confirmed in ~3 seconds')}`
      ].join('\n');
      
      console.log(createNeonBox(successMessage, `${neonSymbols.star} REWARDS CLAIMED ${neonSymbols.star}`));
      
      // Memory scrubbing
      if (pin) keyManager.scrubMemory(pin);
      
    } catch (error) {
      stopSpinner(spinner);

      console.log(neonChalk.error(`${neonSymbols.cross} Reward claiming failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log('');
      console.log(neonChalk.info('Possible causes:'));
      console.log(neonChalk.darkCyan('• No rewards available to claim'));
      console.log(neonChalk.darkCyan('• Invalid account name'));
      console.log(neonChalk.darkCyan('• Network connectivity issues'));
      console.log(neonChalk.darkCyan('• Incorrect PIN'));
      console.log(neonChalk.darkCyan('• Posting key not available'));
    }
  }
  
  private async simulateClaim(account: string, rewardHive: number, rewardHbd: number, rewardVests: number): Promise<void> {
    console.log(neonChalk.glow(`${neonSymbols.diamond} Simulating reward claim...`));
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 1500));

    const mockTxId = generateMockTxId();

    console.log(neonChalk.success(`${neonSymbols.check} Reward claim simulation complete!`));
    console.log('');

    const simulationMessage = [
      `${neonChalk.warning('SIMULATION ONLY - NO REAL CLAIM')}`,
      ``,
      `${neonChalk.cyan('Mock Transaction ID:')} ${neonChalk.highlight(mockTxId)}`,
      `${neonChalk.magenta('Account:')} @${account}`,
      ``,
      `${neonChalk.orange('Mock Claimed HIVE:')} ${rewardHive > 0 ? rewardHive.toFixed(3) : '0.000'} HIVE`,
      `${neonChalk.cyan('Mock Claimed HBD:')} ${rewardHbd > 0 ? rewardHbd.toFixed(3) : '0.000'} HBD`,
      `${neonChalk.electric('Mock Claimed VESTS:')} ${rewardVests > 0 ? rewardVests.toFixed(6) : '0.000000'} VESTS`,
      ``,
      `${neonChalk.green('🎉 Mock rewards would be added to balance!')}`,
      `${neonChalk.info('Remove --mock flag to execute real claim')}`
    ].join('\n');

    console.log(createNeonBox(simulationMessage, `${neonSymbols.star} SIMULATION RESULT ${neonSymbols.star}`));
  }
}