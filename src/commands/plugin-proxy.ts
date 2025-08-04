import { Command, Flags } from '@oclif/core';
import { getPluginManager } from '../utils/simple-plugins.js';
import { getTheme, neonSymbols } from '../utils/neon.js';

// This is a dynamic command that proxies to plugin commands
export default class PluginProxy extends Command {
  static override description = 'Execute plugin commands';
  
  static override hidden = true; // Hide from help
  
  static override flags = {
    help: Flags.help({ char: 'h' })
  };
  
  static override strict = false; // Allow arbitrary args
  
  public async run(): Promise<void> {
    const { argv } = await this.parse(PluginProxy);
    const theme = await getTheme();
    
    if (argv.length === 0) {
      console.log(theme.chalk.error(`${neonSymbols.cross} No command specified`));
      return;
    }
    
    const commandName = argv[0] as string;
    const args = argv.slice(1) as string[];
    const flags = {}; // Simple implementation - no flag parsing for now
    
    try {
      const pluginManager = getPluginManager();
      await pluginManager.initialize();
      
      const commands = pluginManager.getCommands();
      
      if (!commands.has(commandName)) {
        console.log(theme.chalk.error(`${neonSymbols.cross} Unknown command: ${commandName}`));
        console.log('');
        console.log('Available plugin commands:');
        for (const [name, cmd] of commands.entries()) {
          console.log(`  ${theme.chalk.highlight(name)} - ${cmd.description}`);
        }
        return;
      }
      
      await pluginManager.executeCommand(commandName, args, flags);
      
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Command failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}