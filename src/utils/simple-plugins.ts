import * as fs from 'fs-extra';
import * as path from 'path';
import { getTheme, neonSymbols } from './neon.js';

// Simple plugin interface
export interface SimplePlugin {
  name: string;
  description: string;
  version: string;
  
  // Plugin activation
  activate(context: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

// Context provided to plugins
export interface PluginContext {
  // Register new commands
  addCommand(name: string, description: string, handler: CommandHandler): void;
  
  // Register UI commands (for interactive interfaces)
  addUICommand(name: string, description: string, handler: UICommandHandler): void;
  
  // Show messages to user
  log(message: string): void;
  success(message: string): void;
  error(message: string): void;
  
  // Access to wallet (safe operations only)
  wallet: {
    getCurrentAccount(): Promise<string | null>;
    getAccountList(): Promise<string[]>;
    getBalance(account?: string): Promise<any>;
    broadcastCustomJson(account: string, id: string, json: any, requiredAuths?: string[], requiredPostingAuths?: string[]): Promise<any>;
  };
  
  // UI utilities (when available)
  ui?: {
    createForm(options: UIFormOptions): Promise<any>;
    showDialog(options: UIDialogOptions): Promise<string | boolean>;
    showMenu(options: UIMenuOptions): Promise<string>;
    blessed: any; // Access to blessed.js library
  };
}

export type CommandHandler = (args: string[], flags: any) => Promise<void> | void;
export type UICommandHandler = (args: string[], flags: any, uiContext: any) => Promise<void> | void;

// UI interfaces for plugins
export interface UIFormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'password' | 'select';
  required?: boolean;
  default?: string;
  options?: string[]; // For select type
  validation?: (value: string) => string | null;
}

export interface UIFormOptions {
  title: string;
  fields: UIFormField[];
  submitText?: string;
  cancelText?: string;
}

export interface UIDialogOptions {
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'confirm';
  buttons?: string[];
}

export interface UIMenuOptions {
  title: string;
  items: { key: string; label: string; description?: string }[];
  allowBack?: boolean;
}

// Simple plugin manager
export class SimplePluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private pluginDir: string;
  private registeredCommands: Map<string, PluginCommand> = new Map();
  
  constructor() {
    this.pluginDir = path.join(process.env.HOME || '', '.beeline', 'plugins');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.pluginDir);
    await this.loadAllPlugins();
  }
  
  // Install a plugin from a local directory
  async installPlugin(sourcePath: string): Promise<void> {
    const theme = await getTheme();
    
    try {
      // Resolve source path
      const resolvedSource = path.resolve(sourcePath);
      
      // Check if source exists and has package.json
      const packagePath = path.join(resolvedSource, 'package.json');
      if (!await fs.pathExists(packagePath)) {
        throw new Error('No package.json found in plugin directory');
      }
      
      const packageJson = await fs.readJson(packagePath);
      const pluginName = packageJson.name;
      
      if (!pluginName) {
        throw new Error('Plugin package.json must have a name field');
      }
      
      // Copy plugin to plugins directory
      const targetPath = path.join(this.pluginDir, pluginName);
      
      if (await fs.pathExists(targetPath)) {
        console.log(theme.chalk.warning(`${neonSymbols.warning} Plugin ${pluginName} already exists, updating...`));
        await fs.remove(targetPath);
      }
      
      await fs.copy(resolvedSource, targetPath);
      
      // Load the plugin
      await this.loadPlugin(targetPath);
      
      console.log(theme.chalk.success(`${neonSymbols.check} Plugin installed: ${pluginName}`));
      
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }
  
  // Load all plugins from plugin directory with better isolation
  private async loadAllPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginDir);
      
      for (const entry of entries) {
        const pluginPath = path.join(this.pluginDir, entry);
        const stat = await fs.stat(pluginPath);
        
        if (stat.isDirectory()) {
          try {
            // Skip if plugin is already loaded to prevent conflicts
            const packagePath = path.join(pluginPath, 'package.json');
            if (await fs.pathExists(packagePath)) {
              const packageJson = await fs.readJson(packagePath);
              if (this.plugins.has(packageJson.name)) {
                continue; // Skip already loaded plugin
              }
            }
            
            await this.loadPlugin(pluginPath);
          } catch (error) {
            const theme = await getTheme();
            console.log(theme.chalk.error(`${neonSymbols.cross} Failed to load plugin ${entry}: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }
      }
    } catch (error) {
      // Plugin directory doesn't exist or other error - that's ok
    }
  }
  
  // Load a single plugin with enhanced validation
  private async loadPlugin(pluginPath: string): Promise<void> {
    const packagePath = path.join(pluginPath, 'package.json');
    
    // Validate package.json exists and is readable
    if (!await fs.pathExists(packagePath)) {
      throw new Error('Plugin package.json not found');
    }
    
    let packageJson;
    try {
      packageJson = await fs.readJson(packagePath);
    } catch (error) {
      throw new Error(`Invalid package.json: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
    
    // Validate required package.json fields
    if (!packageJson.name || typeof packageJson.name !== 'string') {
      throw new Error('Plugin package.json must have a valid name field');
    }
    
    if (!packageJson.version || typeof packageJson.version !== 'string') {
      throw new Error('Plugin package.json must have a valid version field');
    }
    
    // Check if plugin is already loaded (prevent conflicts)
    if (this.plugins.has(packageJson.name)) {
      throw new Error(`Plugin ${packageJson.name} is already loaded`);
    }
    
    // Find and validate main file
    const mainFile = packageJson.main || 'index.js';
    const mainPath = path.join(pluginPath, mainFile);
    
    if (!await fs.pathExists(mainPath)) {
      throw new Error(`Plugin main file not found: ${mainFile}`);
    }
    
    // Import the plugin with timeout protection
    let pluginModule;
    try {
      const importPromise = import(mainPath);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Plugin import timeout (30s)')), 30000)
      );
      
      pluginModule = await Promise.race([importPromise, timeoutPromise]);
    } catch (error) {
      throw new Error(`Failed to import plugin: ${error instanceof Error ? error.message : 'Import error'}`);
    }
    
    const plugin: SimplePlugin = pluginModule.default || pluginModule;
    
    // Comprehensive plugin validation
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Plugin must export an object');
    }
    
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new Error('Plugin must have a valid name property');
    }
    
    if (!plugin.description || typeof plugin.description !== 'string') {
      throw new Error('Plugin must have a valid description property');
    }
    
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new Error('Plugin must have a valid version property');
    }
    
    if (!plugin.activate || typeof plugin.activate !== 'function') {
      throw new Error('Plugin must have an activate() function');
    }
    
    // Validate plugin name matches package.json
    if (plugin.name !== packageJson.name) {
      throw new Error(`Plugin name "${plugin.name}" doesn't match package.json name "${packageJson.name}"`);
    }
    
    // Create context for plugin
    const context = this.createPluginContext(plugin.name);
    
    // Activate plugin with timeout and error handling
    try {
      const activatePromise = plugin.activate(context);
      if (activatePromise instanceof Promise) {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Plugin activation timeout (15s)')), 15000)
        );
        
        await Promise.race([activatePromise, timeoutPromise]);
      }
    } catch (error) {
      throw new Error(`Plugin activation failed: ${error instanceof Error ? error.message : 'Activation error'}`);
    }
    
    // Store loaded plugin
    this.plugins.set(plugin.name, {
      plugin,
      context,
      path: pluginPath,
      packageJson
    });
    
    // Only show loading message in verbose mode to reduce noise
    if (process.env.BEELINE_VERBOSE || process.env.DEBUG) {
      const theme = await getTheme();
      console.log(theme.chalk.success(`${neonSymbols.check} Loaded plugin: ${plugin.name} v${plugin.version}`));
    }
  }
  
  // Create context for plugin
  private createPluginContext(pluginName: string): PluginContext {
    return {
      addCommand: (name: string, description: string, handler: CommandHandler) => {
        this.registeredCommands.set(name, {
          name,
          description,
          handler,
          pluginName
        });
      },
      
      addUICommand: (name: string, description: string, handler: UICommandHandler) => {
        this.registeredCommands.set(name, {
          name,
          description,
          handler: async (args: string[], flags: any) => {
            // UI commands need special context - this will be enhanced later
            await handler(args, flags, null);
          },
          pluginName,
          isUI: true,
          uiHandler: handler
        });
      },
      
      log: (message: string) => {
        if (process.env.BEELINE_VERBOSE || process.env.DEBUG) {
          console.log(`[${pluginName}] ${message}`);
        }
      },
      
      success: (message: string) => {
        console.log(`\x1b[32m[${pluginName}] ${message}\x1b[0m`);
      },
      
      error: (message: string) => {
        console.log(`\x1b[31m[${pluginName}] ${message}\x1b[0m`);
      },
      
      ui: {
        createForm: async (options: UIFormOptions) => {
          // TODO: Implement form creation
          throw new Error('Form creation not yet implemented');
        },
        showDialog: async (options: UIDialogOptions) => {
          // TODO: Implement dialog
          throw new Error('Dialog not yet implemented');
        },
        showMenu: async (options: UIMenuOptions) => {
          // TODO: Implement menu
          throw new Error('Menu not yet implemented');
        },
        blessed: (() => {
          try {
            return require('blessed');
          } catch (error) {
            return null;
          }
        })()
      },
      
      wallet: {
        getCurrentAccount: async () => {
          try {
            const { KeyManager } = require('./crypto.js');
            const keyManager = new KeyManager();
            await keyManager.initialize();
            return keyManager.getDefaultAccount() || null;
          } catch {
            return null;
          }
        },
        
        getAccountList: async () => {
          try {
            const { KeyManager } = require('./crypto.js');
            const keyManager = new KeyManager();
            await keyManager.initialize();
            return await keyManager.listAccounts();
          } catch {
            return [];
          }
        },
        
        getBalance: async (account?: string) => {
          const { HiveClient } = await import('./hive.js');
          const { KeyManager } = await import('./crypto.js'); 
          const keyManager = new KeyManager();
          await keyManager.initialize();
          
          const targetAccount = account || keyManager.getDefaultAccount();
          if (!targetAccount) {
            throw new Error('No account specified and no default account');
          }
          
          const hiveClient = new HiveClient(keyManager);
          return hiveClient.getBalance(targetAccount);
        },

        broadcastCustomJson: async (account: string, id: string, json: any, requiredAuths: string[] = [], requiredPostingAuths: string[] = []) => {
          const { HiveClient } = await import('./hive.js');
          const { KeyManager } = await import('./crypto.js'); 
          const keyManager = new KeyManager();
          await keyManager.initialize();
          
          const hiveClient = new HiveClient(keyManager);
          
          // First try without PIN (for unencrypted keys)
          try {
            return await hiveClient.broadcastCustomJson(account, id, json, requiredAuths, requiredPostingAuths);
          } catch (error) {
            // If it fails because PIN is required, prompt for PIN using inquirer (same as main commands)
            if (error.message.includes('PIN required')) {
              const { default: inquirer } = await import('inquirer');
              
              const pinPrompt = await inquirer.prompt([{
                type: 'password',
                name: 'pin',
                message: `🔐 Enter PIN to decrypt ${requiredAuths.length > 0 ? 'active' : 'posting'} key for @${account}:`,
                validate: (input: string) => input.length > 0 || 'PIN required'
              }]);
              
              const pin = pinPrompt.pin;
              
              // Clean up inquirer to prevent hanging
              if (process.stdin && process.stdin.destroy) {
                process.stdin.pause();
              }
              
              // Retry with PIN
              try {
                return await hiveClient.broadcastCustomJson(account, id, json, requiredAuths, requiredPostingAuths, pin);
              } catch (pinError) {
                throw new Error(`Transaction failed: ${pinError.message}`);
              }
            }
            throw error;
          }
        }
      }
    };
  }
  
  // Get list of installed plugins
  getPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  // Get registered commands
  getCommands(): Map<string, PluginCommand> {
    return this.registeredCommands;
  }
  
  // Execute a plugin command
  async executeCommand(commandName: string, args: string[], flags: any): Promise<void> {
    const command = this.registeredCommands.get(commandName);
    if (!command) {
      throw new Error(`Command not found: ${commandName}`);
    }
    
    try {
      await command.handler(args, flags);
    } catch (error) {
      const theme = await getTheme();
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin command failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }
  
  // Uninstall a plugin
  async uninstallPlugin(pluginName: string): Promise<void> {
    const theme = await getTheme();
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    try {
      // Deactivate plugin
      if (plugin.plugin.deactivate) {
        await plugin.plugin.deactivate();
      }
      
      // Remove registered commands
      for (const [cmdName, cmd] of this.registeredCommands.entries()) {
        if (cmd.pluginName === pluginName) {
          this.registeredCommands.delete(cmdName);
        }
      }
      
      // Remove from memory
      this.plugins.delete(pluginName);
      
      // Remove files
      await fs.remove(plugin.path);
      
      console.log(theme.chalk.success(`${neonSymbols.check} Plugin uninstalled: ${pluginName}`));
      
    } catch (error) {
      console.log(theme.chalk.error(`${neonSymbols.cross} Failed to uninstall plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }
}

interface LoadedPlugin {
  plugin: SimplePlugin;
  context: PluginContext;
  path: string;
  packageJson: any;
}

interface PluginCommand {
  name: string;
  description: string;
  handler: CommandHandler;
  pluginName: string;
  isUI?: boolean; // UI commands need special handling
  uiHandler?: UICommandHandler;
}

// Global instance
let pluginManager: SimplePluginManager | null = null;

export function getPluginManager(): SimplePluginManager {
  if (!pluginManager) {
    pluginManager = new SimplePluginManager();
  }
  return pluginManager;
}