import { Command, Flags, Args } from '@oclif/core';
import { getTheme, neonSymbols } from '../utils/neon.js';
import { getPluginManager, PluginManager } from '../utils/plugin-system.js';
import * as fs from 'fs-extra';
import * as path from 'path';

export default class Plugin extends Command {
  static override description = 'Manage plugins (install, list, enable, disable)';
  
  static override examples = [
    `$ beeline plugin list`,
    `$ beeline plugin install hive-engine`,
    `$ beeline plugin install @username/my-plugin`,
    `$ beeline plugin install ./local-plugin`,
    `$ beeline plugin enable my-plugin`,
    `$ beeline plugin disable my-plugin`,
    `$ beeline plugin info my-plugin`
  ];

  static override flags = {
    global: Flags.boolean({
      char: 'g',
      description: 'install plugin globally',
      default: false
    }),
    force: Flags.boolean({
      char: 'f', 
      description: 'force operation (skip confirmations)',
      default: false
    }),
    dev: Flags.boolean({
      char: 'd',
      description: 'development mode (disable security checks)',
      default: false
    })
  };

  static override args = {
    action: Args.string({
      description: 'action to perform',
      required: true,
      options: ['list', 'install', 'uninstall', 'enable', 'disable', 'info', 'search']
    }),
    plugin: Args.string({
      description: 'plugin name or source',
      required: false
    })
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Plugin);
    const theme = await getTheme();
    
    const pluginManager = getPluginManager();
    await pluginManager.initialize();
    
    switch (args.action) {
      case 'list':
        await this.listPlugins(pluginManager);
        break;
        
      case 'install':
        if (!args.plugin) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin name or source required for install`));
          return;
        }
        await this.installPlugin(pluginManager, args.plugin, flags);
        break;
        
      case 'uninstall':
        if (!args.plugin) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin name required for uninstall`));
          return;
        }
        await this.uninstallPlugin(pluginManager, args.plugin, flags);
        break;
        
      case 'enable':
        if (!args.plugin) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin name required for enable`));
          return;
        }
        await this.enablePlugin(pluginManager, args.plugin);
        break;
        
      case 'disable':
        if (!args.plugin) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin name required for disable`));
          return;
        }
        await this.disablePlugin(pluginManager, args.plugin);
        break;
        
      case 'info':
        if (!args.plugin) {
          console.log(theme.chalk.error(`${neonSymbols.cross} Plugin name required for info`));
          return;
        }
        await this.showPluginInfo(pluginManager, args.plugin);
        break;
        
      case 'search':
        await this.searchPlugins(args.plugin);
        break;
        
      default:
        console.log(theme.chalk.error(`${neonSymbols.cross} Unknown action: ${args.action}`));
    }
  }
  
  private async listPlugins(pluginManager: PluginManager): Promise<void> {
    const theme = await getTheme();
    const plugins = pluginManager.listPlugins();
    
    if (plugins.length === 0) {
      console.log(theme.chalk.info(`${neonSymbols.bullet} No plugins installed`));
      console.log('');
      console.log(theme.chalk.accent('Discover plugins:'));
      console.log(theme.chalk.highlight('  beeline plugin search'));
      console.log('');
      console.log(theme.chalk.accent('Install a plugin:'));
      console.log(theme.chalk.highlight('  beeline plugin install <name>'));
      return;
    }
    
    console.log(theme.chalk.glow(`${neonSymbols.diamond} Installed Plugins`));
    console.log('');
    
    const pluginList = plugins.map(p => {
      const status = p.active 
        ? theme.chalk.success(`${neonSymbols.check} enabled`)
        : theme.chalk.warning(`${neonSymbols.pause} disabled`);
      
      return [
        `${theme.chalk.highlight(p.manifest.name)} ${theme.chalk.accent(`v${p.manifest.version}`)}`,
        `  ${p.manifest.description}`,
        `  ${theme.chalk.info('Status:')} ${status}`,
        `  ${theme.chalk.info('Author:')} ${p.manifest.author}`,
        `  ${theme.chalk.info('Permissions:')} ${p.manifest.permissions.join(', ')}`
      ].join('\n');
    }).join('\n\n');
    
    console.log(theme.createBox(pluginList, `PLUGINS ${neonSymbols.star} ${plugins.length} installed`));
    console.log('');
    
    // Show plugin commands if any are registered
    const activePlugins = plugins.filter(p => p.active);
    if (activePlugins.length > 0) {
      console.log(theme.chalk.accent('Available plugin commands:'));
      // This would list registered commands from active plugins
      console.log(theme.chalk.info('  Use --help to see plugin-specific commands'));
    }
  }
  
  private async installPlugin(pluginManager: PluginManager, source: string, flags: any): Promise<void> {
    const theme = await getTheme();
    
    try {
      console.log(theme.chalk.info(`${neonSymbols.download} Installing plugin: ${source}`));
      console.log('');
      
      // Determine source type
      let sourceType: 'npm' | 'git' | 'local' = 'npm';
      
      if (source.startsWith('./') || source.startsWith('/') || source.startsWith('~')) {
        sourceType = 'local';
      } else if (source.includes('github.com') || source.includes('gitlab.com') || source.includes('.git')) {
        sourceType = 'git';
      }
      
      switch (sourceType) {
        case 'local':
          await this.installLocalPlugin(pluginManager, source);
          break;
        case 'git':
          await this.installGitPlugin(pluginManager, source);
          break;
        case 'npm':
          await this.installNpmPlugin(pluginManager, source);
          break;
      }
      
      console.log('');
      console.log(theme.chalk.success(`${neonSymbols.check} Plugin installed successfully`));
      console.log(theme.chalk.info('Use ') + theme.chalk.highlight('beeline plugin list') + theme.chalk.info(' to see installed plugins'));
      
    } catch (error) {
      console.log('');
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
  
  private async installLocalPlugin(pluginManager: PluginManager, localPath: string): Promise<void> {
    const theme = await getTheme();
    const resolvedPath = path.resolve(localPath);
    
    // Check if path exists
    if (!await fs.pathExists(resolvedPath)) {
      throw new Error(`Local path does not exist: ${resolvedPath}`);
    }
    
    // Check for package.json
    const manifestPath = path.join(resolvedPath, 'package.json');
    if (!await fs.pathExists(manifestPath)) {
      throw new Error('No package.json found in plugin directory');
    }
    
    console.log(theme.chalk.info(`${neonSymbols.bullet} Loading local plugin from: ${resolvedPath}`));
    
    // Load plugin directly from local path
    await pluginManager.loadPlugin(resolvedPath);
  }
  
  private async installGitPlugin(pluginManager: PluginManager, gitUrl: string): Promise<void> {
    const theme = await getTheme();
    console.log(theme.chalk.info(`${neonSymbols.bullet} Git plugin installation not yet implemented`));
    console.log(theme.chalk.accent('Coming soon: Clone from git repositories'));
    throw new Error('Git plugin installation not yet implemented');
  }
  
  private async installNpmPlugin(pluginManager: PluginManager, packageName: string): Promise<void> {  
    const theme = await getTheme();
    console.log(theme.chalk.info(`${neonSymbols.bullet} NPM plugin installation not yet implemented`));
    console.log(theme.chalk.accent('Coming soon: Install from npm registry'));
    throw new Error('NPM plugin installation not yet implemented');
  }
  
  private async uninstallPlugin(pluginManager: PluginManager, name: string, flags: any): Promise<void> {
    const theme = await getTheme();
    
    const plugin = pluginManager.getPlugin(name);
    if (!plugin) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin not found: ${name}`));
      return;
    }
    
    if (!flags.force) {
      console.log(theme.chalk.warning(`${neonSymbols.warning} This will permanently remove plugin: ${name}`));
      // In real implementation, would prompt for confirmation
    }
    
    try {
      await pluginManager.unloadPlugin(name);
      // Remove plugin files
      await fs.remove(plugin.path);
      
      console.log(theme.chalk.success(`${neonSymbols.check} Plugin uninstalled: ${name}`));
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to uninstall plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
  
  private async enablePlugin(pluginManager: PluginManager, name: string): Promise<void> {
    const theme = await getTheme();
    
    const plugin = pluginManager.getPlugin(name);
    if (!plugin) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin not found: ${name}`));
      return;
    }
    
    if (plugin.active) {
      console.log(theme.chalk.info(`${neonSymbols.bullet} Plugin already enabled: ${name}`));
      return;
    }
    
    try {
      // Re-activate plugin
      await plugin.plugin.activate(plugin.context);
      plugin.active = true;
      
      console.log(theme.chalk.success(`${neonSymbols.check} Plugin enabled: ${name}`));
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to enable plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
  
  private async disablePlugin(pluginManager: PluginManager, name: string): Promise<void> {
    const theme = await getTheme();
    
    const plugin = pluginManager.getPlugin(name);
    if (!plugin) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin not found: ${name}`));
      return;
    }
    
    if (!plugin.active) {
      console.log(theme.chalk.info(`${neonSymbols.bullet} Plugin already disabled: ${name}`));
      return;
    }
    
    try {
      // Deactivate plugin
      if (plugin.plugin.deactivate) {
        await plugin.plugin.deactivate();
      }
      plugin.active = false;
      
      console.log(theme.chalk.success(`${neonSymbols.check} Plugin disabled: ${name}`));
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to disable plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
  
  private async showPluginInfo(pluginManager: PluginManager, name: string): Promise<void> {
    const theme = await getTheme();
    
    const plugin = pluginManager.getPlugin(name);
    if (!plugin) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin not found: ${name}`));
      return;
    }
    
    const manifest = plugin.manifest;
    const status = plugin.active 
      ? theme.chalk.success('enabled')
      : theme.chalk.warning('disabled');
    
    const infoDisplay = [
      `${theme.chalk.highlight('Name:')} ${manifest.name}`,
      `${theme.chalk.highlight('Version:')} ${manifest.version}`,
      `${theme.chalk.highlight('Description:')} ${manifest.description}`,
      `${theme.chalk.highlight('Author:')} ${manifest.author}`,
      `${theme.chalk.highlight('License:')} ${manifest.license || 'Not specified'}`,
      `${theme.chalk.highlight('Status:')} ${status}`,
      ``,
      `${theme.chalk.highlight('Permissions:')}`,
      ...manifest.permissions.map(p => `  ${neonSymbols.bullet} ${p}`),
      ``,
      `${theme.chalk.highlight('Beeline Compatibility:')}`,
      `  ${neonSymbols.bullet} Min version: ${manifest.beeline.minVersion}`,
      ...(manifest.beeline.maxVersion ? [`  ${neonSymbols.bullet} Max version: ${manifest.beeline.maxVersion}`] : []),
      ``,
      `${theme.chalk.highlight('Location:')} ${plugin.path}`
    ].join('\n');
    
    console.log(theme.createBox(infoDisplay, `PLUGIN INFO ${neonSymbols.star} ${manifest.name.toUpperCase()}`));
    
    if (manifest.repository) {
      console.log('');
      console.log(theme.chalk.accent('Repository: ') + theme.chalk.info(manifest.repository));
    }
    
    if (manifest.keywords && manifest.keywords.length > 0) {
      console.log(theme.chalk.accent('Keywords: ') + theme.chalk.info(manifest.keywords.join(', ')));
    }
  }
  
  private async searchPlugins(query?: string): Promise<void> {
    const theme = await getTheme();
    
    console.log(theme.chalk.info(`${neonSymbols.search} Searching for plugins...`));
    console.log('');
    
    // This would implement plugin discovery from:
    // 1. Official Beeline plugin registry
    // 2. NPM packages with 'beeline-plugin' keyword
    // 3. GitHub repositories with beeline-plugin topic
    
    console.log(theme.chalk.accent('Plugin discovery not yet implemented'));
    console.log('');
    console.log(theme.chalk.info('Coming soon:'));
    console.log(`  ${neonSymbols.bullet} Official Beeline plugin registry`);
    console.log(`  ${neonSymbols.bullet} NPM package search`);
    console.log(`  ${neonSymbols.bullet} GitHub repository discovery`);
    console.log('');
    console.log(theme.chalk.accent('For now, you can install plugins from:'));
    console.log(`  ${neonSymbols.bullet} Local directories: `) + theme.chalk.highlight('beeline plugin install ./my-plugin');
    console.log(`  ${neonSymbols.bullet} Git repositories: `) + theme.chalk.highlight('beeline plugin install https://github.com/user/plugin.git');
  }
}