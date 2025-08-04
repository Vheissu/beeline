import { Command, Args } from '@oclif/core';
import { getPluginManager } from '../utils/simple-plugins.js';
import { getTheme, neonSymbols } from '../utils/neon.js';

export default class RunPlugin extends Command {
  static override description = 'Run a plugin command';
  
  static override examples = [
    `$ beeline run-plugin hello`,
    `$ beeline run-plugin hello Alice`,
    `$ beeline run-plugin list-accounts`,
    `$ beeline run-plugin he-transfer alice 10 BEE --mock`,
    `$ beeline run-plugin he-transfer alice 10 BEE "Payment" --from myaccount`
  ];
  
  static override strict = false; // Allow any number of args
  
  static override args = {
    command: Args.string({
      description: 'plugin command to run',
      required: true
    })
  };

  public async run(): Promise<void> {
    const theme = await getTheme();
    
    // Parse raw process arguments to bypass OCLIF's flag validation
    // Find the run-plugin command position and extract everything after it
    const processArgs = process.argv;
    const runPluginIndex = processArgs.findIndex(arg => arg === 'run-plugin');
    
    if (runPluginIndex === -1 || runPluginIndex + 1 >= processArgs.length) {
      console.log(theme.chalk.error(`${neonSymbols.cross} No command specified`));
      console.log('Usage: beeline run-plugin <command> [args...]');
      return;
    }
    
    // Get all arguments after run-plugin
    const pluginArgs = processArgs.slice(runPluginIndex + 1);
    const commandName = pluginArgs[0];
    
    if (!commandName) {
      console.log(theme.chalk.error(`${neonSymbols.cross} No command specified`));
      console.log('Usage: beeline run-plugin <command> [args...]');
      return;
    }
    
    // Parse arguments and flags manually
    const remainingArgs = pluginArgs.slice(1);
    const args: string[] = [];
    const flags: { [key: string]: string | boolean } = {};
    
    for (let i = 0; i < remainingArgs.length; i++) {
      const arg = remainingArgs[i];
      
      if (arg.startsWith('--')) {
        // Handle long flags like --mock or --from account
        const flagName = arg.substring(2);
        
        // Check if next argument is the flag value (not another flag)
        const nextArg = remainingArgs[i + 1];
        if (i + 1 < remainingArgs.length && !nextArg.startsWith('--')) {
          // Flag with value: --from account
          flags[flagName] = nextArg;
          i++; // Skip the next argument since it's the flag value
        } else {
          // Boolean flag: --mock
          flags[flagName] = true;
        }
      } else if (arg.startsWith('-')) {
        // Handle short flags like -m
        const flagName = arg.substring(1);
        flags[flagName] = true;
      } else {
        // Regular argument
        args.push(arg);
      }
    }
    
    try {
      const pluginManager = getPluginManager();
      await pluginManager.initialize();
      
      const commands = pluginManager.getCommands();
      
      if (!commands.has(commandName)) {
        console.log(theme.chalk.error(`${neonSymbols.cross} Plugin command not found: ${commandName}`));
        console.log('');
        console.log('Available plugin commands:');
        for (const [name, cmd] of commands.entries()) {
          console.log(`  ${theme.chalk.highlight(name)} - ${cmd.description} ${theme.chalk.info(`(${cmd.pluginName})`)}`);
        }
        return;
      }
      
      await pluginManager.executeCommand(commandName, args, flags);
      
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin command failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}