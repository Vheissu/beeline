import { Command, Flags, Args } from '@oclif/core';
import { getTheme, neonSymbols } from '../utils/neon.js';
import { getPluginManager, SimplePluginManager } from '../utils/simple-plugins.js';

export default class Plugins extends Command {
  static override description = 'Manage plugins (install, list, uninstall)';
  
  static override examples = [
    `$ beeline plugins list`,
    `$ beeline plugins install ./my-plugin`,
    `$ beeline plugins uninstall my-plugin`
  ];

  static override flags = {
    help: Flags.help({ char: 'h' })
  };

  static override args = {
    action: Args.string({
      description: 'action to perform',
      required: true,
      options: ['list', 'install', 'uninstall']
    }),
    target: Args.string({
      description: 'plugin name or path',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args } = await this.parse(Plugins);
    const theme = await getTheme();
    
    const pluginManager = getPluginManager();
    await pluginManager.initialize();
    
    switch (args.action) {
      case 'list':
        await this.listPlugins(pluginManager);
        break;
        
      case 'install':
        if (!args.target) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin path required for install`));
          console.log('Usage: beeline plugins install <path>');
          return;
        }
        await this.installPlugin(pluginManager, args.target);
        break;
        
      case 'uninstall':
        if (!args.target) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin name required for uninstall`));
          console.log('Usage: beeline plugins uninstall <name>');
          return;
        }
        await this.uninstallPlugin(pluginManager, args.target);
        break;
        
      default:
        console.log(theme.chalk.error(`${neonSymbols.cross} Unknown action: ${args.action}`));
    }
  }
  
  private async listPlugins(pluginManager: SimplePluginManager): Promise<void> {
    const theme = await getTheme();
    const plugins = pluginManager.getPlugins();
    const commands = pluginManager.getCommands();
    
    if (plugins.length === 0) {
      console.log(theme.chalk.info(`${neonSymbols.bullet} No plugins installed`));
      console.log('');
      console.log(theme.chalk.accent('Install a plugin:'));
      console.log(theme.chalk.highlight('  beeline plugins install <path>'));
      return;
    }
    
    console.log(theme.chalk.glow(`${neonSymbols.diamond} Installed Plugins`));
    console.log('');
    
    for (const loadedPlugin of plugins) {
      const plugin = loadedPlugin.plugin;
      const pkg = loadedPlugin.packageJson;
      
      console.log(`${theme.chalk.highlight(plugin.name)} ${theme.chalk.accent(`v${plugin.version || pkg.version}`)}`);
      console.log(`  ${plugin.description || pkg.description || 'No description'}`);
      console.log(`  ${theme.chalk.info('Path:')} ${loadedPlugin.path}`);
      console.log('');
    }
    
    // Show available commands
    const pluginCommands = Array.from(commands.entries());
    if (pluginCommands.length > 0) {
      console.log(theme.chalk.accent('Available plugin commands:'));
      for (const [cmdName, cmd] of pluginCommands) {
        console.log(`  ${theme.chalk.highlight(cmdName)} - ${cmd.description} ${theme.chalk.info(`(${cmd.pluginName})`)}`);
      }
      console.log('');
    }
  }
  
  private async installPlugin(pluginManager: SimplePluginManager, pluginPath: string): Promise<void> {
    try {
      await pluginManager.installPlugin(pluginPath);
    } catch (error) {
      // Error already logged by plugin manager
    }
  }
  
  private async uninstallPlugin(pluginManager: SimplePluginManager, pluginName: string): Promise<void> {
    try {
      await pluginManager.uninstallPlugin(pluginName);
    } catch (error) {
      // Error already logged by plugin manager
    }
  }
}