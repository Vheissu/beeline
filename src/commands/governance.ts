import { Command, Flags, Args } from '@oclif/core';
import { neonChalk, createNeonBox, neonSymbols, neonSpinner } from '../utils/neon.js';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import inquirer from 'inquirer';

export default class Governance extends Command {
  static override description = 'Manage Hive governance - witness voting and proxy operations with cyberpunk style';
  
  static override examples = [
    `$ beeline governance vote @blocktrades`,
    `$ beeline governance unvote @witness`,
    `$ beeline governance proxy @account`,
    `$ beeline governance unproxy`,
    `$ beeline governance witnesses`,
    `$ beeline governance status`
  ];

  static override flags = {
    from: Flags.string({
      char: 'f',
      description: 'account to vote from (defaults to default account)'
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
      description: 'simulate governance operation without broadcasting',
      default: false
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'limit number of witnesses to display',
      default: 30
    }),
    active: Flags.boolean({
      char: 'a',
      description: 'show only active witnesses',
      default: false
    })
  };

  static override args = {
    action: Args.string({
      description: 'governance action',
      required: true,
      options: ['vote', 'unvote', 'proxy', 'unproxy', 'witnesses', 'status']
    }),
    target: Args.string({
      description: 'witness or proxy account name',
      required: false
    })
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Governance);
    
    try {
      const keyManager = new KeyManager();
      await keyManager.initialize();
      const hiveClient = new HiveClient(keyManager, flags.node);

      switch (args.action) {
        case 'vote':
          await this.handleWitnessVote(hiveClient, keyManager, args.target, flags, true);
          break;
        case 'unvote':
          await this.handleWitnessVote(hiveClient, keyManager, args.target, flags, false);
          break;
        case 'proxy':
          await this.handleWitnessProxy(hiveClient, keyManager, args.target, flags, true);
          break;
        case 'unproxy':
          await this.handleWitnessProxy(hiveClient, keyManager, '', flags, false);
          break;
        case 'witnesses':
          await this.showWitnessList(hiveClient, flags);
          break;
        case 'status':
          await this.showGovernanceStatus(hiveClient, keyManager, flags);
          break;
        default:
          this.error(`Unknown action: ${args.action}`);
      }

    } catch (error) {
      this.error(`Governance operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleWitnessVote(
    hiveClient: HiveClient, 
    keyManager: KeyManager,
    witness: string | undefined, 
    flags: any, 
    approve: boolean
  ): Promise<void> {
    if (!witness) {
      this.error(`Witness account is required for ${approve ? 'voting' : 'unvoting'}`);
    }

    // Clean witness name (remove @ if present)
    const cleanWitness = witness.startsWith('@') ? witness.slice(1) : witness;

    // Get the account to vote from
    let fromAccount = flags.from;
    if (!fromAccount) {
      fromAccount = keyManager.getDefaultAccount();
    }
    if (!fromAccount) {
      this.error('No account specified. Use --from or set a default account with login command.');
    }

    // Show operation preview
    const action = approve ? 'VOTE FOR' : 'UNVOTE';
    const actionColor = approve ? 'green' : 'pink';
    
    console.log(createNeonBox(`
${neonSymbols.vote} ${neonChalk[actionColor].bold(action)} WITNESS ${neonSymbols.vote}

${neonChalk.cyan('From:')} ${neonChalk.white(fromAccount)}
${neonChalk.cyan('Witness:')} ${neonChalk.white(cleanWitness)}
${neonChalk.cyan('Action:')} ${neonChalk[actionColor](approve ? 'Approve' : 'Disapprove')}
${flags.mock ? neonChalk.yellow.bold('\n⚠️  MOCK MODE - No transaction will be broadcast') : ''}
    `.trim()));

    // Confirmation prompt
    if (!flags.confirm && !flags.mock) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `${approve ? 'Vote for' : 'Unvote'} witness ${cleanWitness}?`,
        default: false
      }]);

      if (!proceed) {
        console.log(neonChalk.yellow('Operation cancelled.'));
        return;
      }
    }

    // Handle mock case early
    if (flags.mock) {
      const spinner = neonSpinner(`${approve ? 'Voting for' : 'Unvoting'} witness...`);
      try {
        // Simulate delay for mock mode
        await new Promise(resolve => setTimeout(resolve, 2000));
        clearInterval(spinner);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        console.log(neonChalk.green(`✓ Mock ${approve ? 'vote' : 'unvote'} successful!`));
        console.log(neonChalk.white.dim(`Would ${approve ? 'vote for' : 'unvote'} witness: ${cleanWitness}`));
      } catch (error) {
        clearInterval(spinner);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        throw error;
      }
      return;
    }

    // Check if active key exists for the account
    const keys = await keyManager.listKeys(fromAccount);
    const activeKey = keys.find(k => k.role === 'active');
    
    if (!activeKey) {
      console.log(neonChalk.error(`${neonSymbols.cross} Active key not found for account @${fromAccount}`));
      console.log(neonChalk.info('Import active key with: ') + neonChalk.highlight(`beeline keys import ${fromAccount} active`));
      return;
    }

    // Get PIN for transaction signing (BEFORE starting spinner)
    let pin: string | undefined;
    if (activeKey.encrypted) {
      const pinPrompt = await inquirer.prompt([{
        type: 'password',
        name: 'pin',
        message: neonChalk.cyan(`Enter PIN to ${approve ? 'vote for' : 'unvote'} witness:`),
        mask: '*',
        validate: (input: string) => input.length > 0 || 'PIN required'
      }]);
      pin = pinPrompt.pin;
    }

    // NOW start spinner after all user input is complete
    const spinner = neonSpinner(`${approve ? 'Voting for' : 'Unvoting'} witness...`);

    try {
      const txId = await hiveClient.witnessVote(fromAccount, cleanWitness, approve, pin);
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.green(`✓ Witness ${approve ? 'vote' : 'unvote'} successful!`));
      console.log(neonChalk.white.dim(`Transaction ID: ${txId}`));
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      throw error;
    }
  }

  private async handleWitnessProxy(
    hiveClient: HiveClient, 
    keyManager: KeyManager,
    proxy: string, 
    flags: any, 
    setProxy: boolean
  ): Promise<void> {
    // Get the account to set proxy from
    let fromAccount = flags.from;
    if (!fromAccount) {
      fromAccount = keyManager.getDefaultAccount();
    }
    if (!fromAccount) {
      this.error('No account specified. Use --from or set a default account with login command.');
    }

    let cleanProxy = '';
    if (setProxy) {
      if (!proxy) {
        this.error('Proxy account is required when setting proxy');
      }
      cleanProxy = proxy.startsWith('@') ? proxy.slice(1) : proxy;
    }

    // Show operation preview
    const action = setProxy ? 'SET PROXY' : 'CLEAR PROXY';
    
    console.log(createNeonBox(`
${neonSymbols.proxy} ${neonChalk.magenta.bold(action)} ${neonSymbols.proxy}

${neonChalk.cyan('From:')} ${neonChalk.white(fromAccount)}
${setProxy ? `${neonChalk.cyan('Proxy:')} ${neonChalk.white(cleanProxy)}` : neonChalk.cyan('Action: Clear current proxy')}
${flags.mock ? neonChalk.yellow.bold('\n⚠️  MOCK MODE - No transaction will be broadcast') : ''}
    `.trim()));

    // Confirmation prompt
    if (!flags.confirm && !flags.mock) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: setProxy ? `Set ${cleanProxy} as your witness voting proxy?` : 'Clear your current witness voting proxy?',
        default: false
      }]);

      if (!proceed) {
        console.log(neonChalk.yellow('Operation cancelled.'));
        return;
      }
    }

    // Handle mock case early
    if (flags.mock) {
      const spinner = neonSpinner(setProxy ? 'Setting proxy...' : 'Clearing proxy...');
      try {
        // Simulate delay for mock mode
        await new Promise(resolve => setTimeout(resolve, 2000));
        clearInterval(spinner);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        
        console.log(neonChalk.green(`✓ Mock proxy operation successful!`));
        console.log(neonChalk.white.dim(setProxy ? `Would set proxy to: ${cleanProxy}` : 'Would clear current proxy'));
      } catch (error) {
        clearInterval(spinner);
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
        throw error;
      }
      return;
    }

    // Check if active key exists for the account
    const keys = await keyManager.listKeys(fromAccount);
    const activeKey = keys.find(k => k.role === 'active');
    
    if (!activeKey) {
      console.log(neonChalk.error(`${neonSymbols.cross} Active key not found for account @${fromAccount}`));
      console.log(neonChalk.info('Import active key with: ') + neonChalk.highlight(`beeline keys import ${fromAccount} active`));
      return;
    }

    // Get PIN for transaction signing (BEFORE starting spinner)
    let pin: string | undefined;
    if (activeKey.encrypted) {
      const pinPrompt = await inquirer.prompt([{
        type: 'password',
        name: 'pin',
        message: neonChalk.cyan(`Enter PIN to ${setProxy ? 'set' : 'clear'} proxy:`),
        mask: '*',
        validate: (input: string) => input.length > 0 || 'PIN required'
      }]);
      pin = pinPrompt.pin;
    }

    // NOW start spinner after all user input is complete
    const spinner = neonSpinner(setProxy ? 'Setting proxy...' : 'Clearing proxy...');

    try {
      const txId = await hiveClient.witnessProxy(fromAccount, cleanProxy, pin);
      
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      
      console.log(neonChalk.green(`✓ Proxy operation successful!`));
      console.log(neonChalk.white.dim(`Transaction ID: ${txId}`));
    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      throw error;
    }
  }

  private async showWitnessList(hiveClient: HiveClient, flags: any): Promise<void> {
    const spinner = neonSpinner('Loading witness data...');

    try {
      const witnesses = await hiveClient.getWitnesses(flags.limit, flags.active);
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');

      console.log(createNeonBox(`
${neonSymbols.list} ${neonChalk.cyan.bold('HIVE WITNESSES')} ${neonSymbols.list}

${neonChalk.white.dim('Displaying top')} ${neonChalk.white(witnesses.length)} ${neonChalk.white.dim(flags.active ? 'active witnesses' : 'witnesses by vote count')}
      `.trim()));

      // Display witnesses in a formatted table
      witnesses.forEach((witness, index) => {
        const rank = neonChalk.white.dim(`${(index + 1).toString().padStart(2, ' ')}.`);
        const name = neonChalk.white.bold(witness.owner.padEnd(20, ' '));
        const votes = neonChalk.cyan(this.formatVotes(witness.votes));
        const status = witness.signing_key === 'STM1111111111111111111111111111111114T1Anm' 
          ? neonChalk.pink('DISABLED') 
          : neonChalk.green('ACTIVE');
        
        console.log(`${rank} ${name} ${votes} ${status}`);
      });

    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      throw error;
    }
  }

  private async showGovernanceStatus(hiveClient: HiveClient, keyManager: KeyManager, flags: any): Promise<void> {
    
    let account = flags.from;
    if (!account) {
      account = keyManager.getDefaultAccount();
    }
    if (!account) {
      this.error('No account specified. Use --from or set a default account with login command.');
    }

    const spinner = neonSpinner('Loading governance status...');

    try {
      const status = await hiveClient.getGovernanceStatus(account);
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');

      console.log(createNeonBox(`
${neonSymbols.info} ${neonChalk.cyan.bold('GOVERNANCE STATUS')} ${neonSymbols.info}

${neonChalk.cyan('Account:')} ${neonChalk.white(account)}
${neonChalk.cyan('Proxy:')} ${status.proxy || neonChalk.white.dim('None')}
${neonChalk.cyan('Witness Votes:')} ${neonChalk.white(status.witnessVotes.length)}/30
${neonChalk.cyan('Voting Power:')} ${neonChalk.white(this.formatVotingPower(status.votingPower))}

${status.witnessVotes.length > 0 ? neonChalk.cyan.bold('Current Witness Votes:') : ''}
${status.witnessVotes.map(w => neonChalk.white(`  • ${w}`)).join('\n')}
      `.trim()));

    } catch (error) {
      clearInterval(spinner);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      throw error;
    }
  }

  private formatVotes(votes: string): string {
    const voteCount = parseInt(votes);
    if (voteCount >= 1000000000) {
      return `${(voteCount / 1000000000).toFixed(1)}B votes`;
    } else if (voteCount >= 1000000) {
      return `${(voteCount / 1000000).toFixed(1)}M votes`;
    } else if (voteCount >= 1000) {
      return `${(voteCount / 1000).toFixed(1)}K votes`;
    }
    return `${voteCount} votes`;
  }

  private formatVotingPower(vestsString: string): string {
    const vests = parseFloat(vestsString);
    if (vests >= 1000000000) {
      return `${(vests / 1000000000).toFixed(1)}B VESTS`;
    } else if (vests >= 1000000) {
      return `${(vests / 1000000).toFixed(1)}M VESTS`;
    } else if (vests >= 1000) {
      return `${(vests / 1000).toFixed(1)}K VESTS`;
    }
    return `${vests.toFixed(0)} VESTS`;
  }
}