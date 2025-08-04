import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { getTheme, neonSymbols } from './neon.js';

// Plugin metadata interface
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  repository?: string;
  keywords?: string[];
  main: string;
  permissions: PluginPermission[];
  dependencies?: Record<string, string>;
  beeline: {
    minVersion: string;
    maxVersion?: string;
  };
}

// Plugin permission system
export type PluginPermission = 
  | 'hive:read'        // Read blockchain data
  | 'hive:write'       // Send transactions
  | 'keys:read'        // Access key vault (read-only)
  | 'accounts:read'    // Access account list
  | 'network:http'     // Make HTTP requests
  | 'storage:read'     // Read plugin storage
  | 'storage:write'    // Write plugin storage
  | 'ui:commands'      // Register CLI commands
  | 'ui:hooks'         // Register command hooks
  | 'system:exec';     // Execute system commands (dangerous)

// Plugin lifecycle interface
export interface BeelinePlugin {
  manifest: PluginManifest;
  activate(context: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}

// Plugin context - API surface available to plugins
export interface PluginContext {
  // Core APIs
  hive: PluginHiveAPI;
  keys: PluginKeysAPI;
  accounts: PluginAccountsAPI;
  ui: PluginUIAPI;
  storage: PluginStorageAPI;
  
  // Event system
  events: PluginEventBus;
  
  // Plugin info
  plugin: {
    name: string;
    version: string;
    dataPath: string;
  };
}

// Hive blockchain API for plugins
export interface PluginHiveAPI {
  getBalance(account: string): Promise<any>;
  getAccount(account: string): Promise<any>;
  getDynamicGlobalProperties(): Promise<any>;
  sendOperation(op: any, key?: string): Promise<any>;
  // Read-only by default, write operations require 'hive:write' permission
}

// Key management API for plugins  
export interface PluginKeysAPI {
  listAccounts(): string[];
  hasKey(account: string, role: string): boolean;
  // No direct key access for security
}

// Account management API
export interface PluginAccountsAPI {
  list(): string[];
  getCurrent(): string | null;
  switch(account: string): Promise<boolean>;
}

// UI integration API
export interface PluginUIAPI {
  registerCommand(command: PluginCommand): void;
  registerHook(event: HookEvent, handler: HookHandler): void;
  showMessage(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
  prompt(message: string, options?: any): Promise<any>;
}

// Plugin storage API
export interface PluginStorageAPI {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Event bus for plugin communication
export interface PluginEventBus {
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}

// Plugin command registration
export interface PluginCommand {
  name: string;
  description: string;
  usage?: string;
  flags?: Record<string, any>;
  handler: (args: any, flags: any) => Promise<void>;
}

// Hook system for extending existing commands
export type HookEvent = 
  | 'before:balance'
  | 'after:balance'
  | 'before:transfer'
  | 'after:transfer'
  | 'before:login'
  | 'after:login';

export type HookHandler = (context: HookContext) => Promise<void> | void;

export interface HookContext {
  command: string;
  args: any;
  flags: any;
  result?: any;
}

// Plugin manager - main orchestrator
export class PluginManager {
  private plugins = new Map<string, LoadedPlugin>();
  private eventBus = new EventEmitter();
  private dataDir: string;
  
  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.env.HOME || '', '.beeline', 'plugins');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.dataDir);
    await this.loadInstalledPlugins();
  }
  
  async installPlugin(source: string): Promise<void> {
    const theme = await getTheme();
    console.log(theme.chalk.info(`${neonSymbols.download} Installing plugin from ${source}...`));
    
    // Implementation for npm packages, git repos, or local paths
    // This would handle downloading, validation, and installation
    throw new Error('Plugin installation not yet implemented');
  }
  
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Security: Validate plugin path is within allowed directories
      const resolvedPath = path.resolve(pluginPath);
      if (!this.isAllowedPluginPath(resolvedPath)) {
        throw new Error('Plugin path not allowed - must be within plugin directory or explicitly trusted');
      }
      
      const manifestPath = path.join(resolvedPath, 'package.json');
      const manifest = await fs.readJson(manifestPath) as PluginManifest;
      
      // Validate manifest
      this.validateManifest(manifest);
      
      // Security: Check if plugin already loaded
      if (this.plugins.has(manifest.name)) {
        throw new Error(`Plugin ${manifest.name} is already loaded`);
      }
      
      // Check permissions
      if (!await this.checkPermissions(manifest)) {
        throw new Error(`Plugin ${manifest.name} requires permissions that are not granted`);
      }
      
      // Security: Validate main file exists and has safe extension
      const mainPath = path.join(resolvedPath, manifest.main);
      if (!await fs.pathExists(mainPath)) {
        throw new Error(`Plugin main file not found: ${manifest.main}`);
      }
      
      if (!this.isSafePluginFile(mainPath)) {
        throw new Error(`Plugin main file has unsafe extension: ${manifest.main}`);
      }
      
      // Load plugin code with timeout
      const pluginModule = await Promise.race([
        import(mainPath),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Plugin loading timeout')), 5000)
        )
      ]) as any;
      
      const plugin: BeelinePlugin = pluginModule.default || pluginModule;
      
      // Validate plugin interface
      if (!plugin || typeof plugin.activate !== 'function') {
        throw new Error('Plugin must export an object with activate() method');
      }
      
      // Create sandboxed context
      const context = this.createPluginContext(manifest, resolvedPath);
      
      // Activate plugin with timeout
      await Promise.race([
        plugin.activate(context),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Plugin activation timeout')), 10000)
        )
      ]);
      
      this.plugins.set(manifest.name, {
        manifest,
        plugin,
        context,
        path: resolvedPath,
        active: true
      });
      
      const theme = await getTheme();
      console.log(theme.chalk.success(`${neonSymbols.check} Loaded plugin: ${manifest.name} v${manifest.version}`));
      
    } catch (error) {
      const theme = await getTheme();
      console.error(theme.chalk.error(`${neonSymbols.cross} Failed to load plugin: ${error instanceof Error ? error.message : 'Unknown error'}`));
      throw error;
    }
  }
  
  async unloadPlugin(name: string): Promise<void> {
    const loadedPlugin = this.plugins.get(name);
    if (!loadedPlugin) return;
    
    try {
      if (loadedPlugin.plugin.deactivate) {
        await loadedPlugin.plugin.deactivate();
      }
      
      this.plugins.delete(name);
      
      const theme = await getTheme();
      console.log(theme.chalk.info(`${neonSymbols.bullet} Unloaded plugin: ${name}`));
    } catch (error) {
      const theme = await getTheme();
      console.error(theme.chalk.error(`${neonSymbols.cross} Error unloading plugin ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
  
  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }
  
  private async loadInstalledPlugins(): Promise<void> {
    try {
      const pluginDirs = await fs.readdir(this.dataDir);
      
      for (const dir of pluginDirs) {
        const pluginPath = path.join(this.dataDir, dir);
        const stat = await fs.stat(pluginPath);
        
        if (stat.isDirectory()) {
          await this.loadPlugin(pluginPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist yet or other error
      // This is normal for first run
    }
  }
  
  private validateManifest(manifest: PluginManifest): void {
    const required = ['name', 'version', 'description', 'author', 'main', 'permissions', 'beeline'];
    
    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Plugin manifest missing required field: ${field}`);
      }
    }
    
    // Validate semver
    if (!manifest.version.match(/^\d+\.\d+\.\d+/)) {
      throw new Error('Plugin version must be valid semver');
    }
    
    // Validate beeline version compatibility
    // This would check against current beeline version
  }
  
  private async checkPermissions(manifest: PluginManifest): Promise<boolean> {
    const dangerousPermissions = ['system:exec', 'hive:write'];
    const highRiskPermissions = ['keys:read', 'network:http'];
    
    // Check for dangerous permissions
    const dangerous = manifest.permissions.filter(p => dangerousPermissions.includes(p));
    const highRisk = manifest.permissions.filter(p => highRiskPermissions.includes(p));
    
    if (dangerous.length > 0) {
      const theme = await getTheme();
      console.log('');
      console.log(theme.chalk.error(`${neonSymbols.warning} SECURITY WARNING: Plugin ${manifest.name} requests DANGEROUS permissions:`));
      dangerous.forEach(p => {
        const description = this.getPermissionDescription(p);
        console.log(theme.chalk.error(`  ${neonSymbols.cross} ${p} - ${description}`));
      });
      console.log('');
      console.log(theme.chalk.warning('These permissions allow the plugin to:'));
      console.log(theme.chalk.warning('- Access private keys and send transactions'));  
      console.log(theme.chalk.warning('- Execute system commands'));
      console.log(theme.chalk.warning('- Potentially steal funds or compromise security'));
      console.log('');
      
      // For now, auto-deny dangerous permissions
      // In a full implementation, would prompt with strong warnings
      console.log(theme.chalk.error('Dangerous permissions are currently disabled for security.'));
      return false;  
    }
    
    if (highRisk.length > 0) {
      const theme = await getTheme();
      console.log('');
      console.log(theme.chalk.warning(`${neonSymbols.warning} Plugin ${manifest.name} requests elevated permissions:`));
      highRisk.forEach(p => {
        const description = this.getPermissionDescription(p);
        console.log(theme.chalk.warning(`  ${neonSymbols.bullet} ${p} - ${description}`));
      });
      console.log('');
      console.log(theme.chalk.info('These permissions are granted automatically but monitored.'));
    }
    
    // Auto-grant safe permissions
    const safePermissions = ['hive:read', 'accounts:read', 'storage:read', 'storage:write', 'ui:commands', 'ui:hooks'];
    const allSafe = manifest.permissions.every(p => safePermissions.includes(p) || highRiskPermissions.includes(p));
    
    if (allSafe) {
      return true;
    }
    
    // Block unknown permissions
    const unknownPermissions = manifest.permissions.filter(p => 
      !safePermissions.includes(p) && !highRiskPermissions.includes(p) && !dangerousPermissions.includes(p)
    );
    
    if (unknownPermissions.length > 0) {
      const theme = await getTheme();
      console.log(theme.chalk.error(`${neonSymbols.cross} Plugin requests unknown permissions: ${unknownPermissions.join(', ')}`));
      return false;
    }
    
    return true;
  }
  
  private getPermissionDescription(permission: PluginPermission): string {
    const descriptions = {
      'hive:read': 'Read blockchain data and account information',
      'hive:write': 'Send transactions and operations to the blockchain',
      'keys:read': 'Access key vault and account list',
      'accounts:read': 'View account information',
      'network:http': 'Make HTTP requests to external services',
      'storage:read': 'Read plugin data from storage',
      'storage:write': 'Write plugin data to storage',
      'ui:commands': 'Register new CLI commands',
      'ui:hooks': 'Hook into existing commands',
      'system:exec': 'Execute system commands (VERY DANGEROUS)'
    };
    return descriptions[permission] || 'Unknown permission';
  }
  
  private isAllowedPluginPath(pluginPath: string): boolean {
    const allowedPaths = [
      this.dataDir,  // ~/.beeline/plugins
      path.resolve('./examples/plugins'),  // Development examples
      path.resolve('./plugins'),  // Local plugins
    ];
    
    // Check if path is within allowed directories
    return allowedPaths.some(allowedPath => {
      const relative = path.relative(allowedPath, pluginPath);
      return !relative.startsWith('..') && !path.isAbsolute(relative);
    });
  }
  
  private isSafePluginFile(filePath: string): boolean {
    const allowedExtensions = ['.js', '.mjs', '.cjs'];
    const ext = path.extname(filePath).toLowerCase();
    return allowedExtensions.includes(ext);
  }
  
  private createPluginContext(manifest: PluginManifest, pluginPath: string): PluginContext {
    return {
      hive: this.createHiveAPI(manifest.permissions),
      keys: this.createKeysAPI(manifest.permissions),
      accounts: this.createAccountsAPI(manifest.permissions),
      ui: this.createUIAPI(manifest.permissions),
      storage: this.createStorageAPI(manifest.name),
      events: this.createEventBus(),
      plugin: {
        name: manifest.name,
        version: manifest.version,
        dataPath: path.join(this.dataDir, manifest.name, 'data')
      }
    };
  }
  
  private createHiveAPI(permissions: PluginPermission[]): PluginHiveAPI {
    const hasReadPermission = permissions.includes('hive:read');
    const hasWritePermission = permissions.includes('hive:write');
    
    return {
      async getBalance(account: string) {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have hive:read permission');
        }
        // Import HiveClient lazily to avoid circular dependencies
        const { HiveClient } = await import('./hive.js');
        const { KeyManager } = await import('./crypto.js');
        const keyManager = new KeyManager();
        await keyManager.initialize();
        const hiveClient = new HiveClient(keyManager);
        return hiveClient.getBalance(account);
      },
      
      async getAccount(account: string) {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have hive:read permission');
        }
        const { HiveClient } = await import('./hive.js');
        const { KeyManager } = await import('./crypto.js');
        const keyManager = new KeyManager();
        await keyManager.initialize();
        const hiveClient = new HiveClient(keyManager);
        return hiveClient.getAccount(account);
      },
      
      async getDynamicGlobalProperties() {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have hive:read permission');
        }
        const { HiveClient } = await import('./hive.js');
        const { KeyManager } = await import('./crypto.js');
        const keyManager = new KeyManager();
        await keyManager.initialize();
        const hiveClient = new HiveClient(keyManager);
        // Access the underlying client for global properties
        return hiveClient['client'].database.getDynamicGlobalProperties();
      },
      
      async sendOperation(op: any, key?: string) {
        if (!hasWritePermission) {
          throw new Error('Plugin does not have hive:write permission');
        }
        // Plugins should not have direct transaction access for security
        // This would require specific wrapper methods for safe operations
        throw new Error('Direct transaction sending not available to plugins. Use specific transfer methods.');
      }
    };
  }
  
  private createKeysAPI(permissions: PluginPermission[]): PluginKeysAPI {
    const hasReadPermission = permissions.includes('keys:read');
    
    return {
      listAccounts(): string[] {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have keys:read permission');
        }
        // Safe read-only access to account list
        try {
          const { KeyManager } = require('./crypto.js');
          const keyManager = new KeyManager();
          // This would return account names only, no keys
          return keyManager.listAccounts();
        } catch {
          return [];
        }
      },
      
      hasKey(account: string, role: string): boolean {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have keys:read permission');
        }
        try {
          const { KeyManager } = require('./crypto.js');
          const keyManager = new KeyManager();
          return keyManager.hasKey(account, role);
        } catch {
          return false;
        }
      }
    };
  }
  
  private createAccountsAPI(permissions: PluginPermission[]): PluginAccountsAPI {
    const hasReadPermission = permissions.includes('accounts:read');
    
    return {
      list(): string[] {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have accounts:read permission');
        }
        try {
          const { KeyManager } = require('./crypto.js');
          const keyManager = new KeyManager();
          return keyManager.listAccounts();
        } catch {
          return [];
        }
      },
      
      getCurrent(): string | null {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have accounts:read permission');
        }
        try {
          const { KeyManager } = require('./crypto.js');
          const keyManager = new KeyManager();
          return keyManager.getDefaultAccount();
        } catch {
          return null;
        }
      },
      
      async switch(account: string): Promise<boolean> {
        if (!hasReadPermission) {
          throw new Error('Plugin does not have accounts:read permission');
        }
        // Plugins cannot switch accounts - read-only access
        throw new Error('Plugins cannot switch accounts - read-only access');
      }
    };
  }
  
  private createUIAPI(permissions: PluginPermission[]): PluginUIAPI {
    const hasCommandsPermission = permissions.includes('ui:commands');
    const hasHooksPermission = permissions.includes('ui:hooks');
    
    return {
      registerCommand(command: PluginCommand): void {
        if (!hasCommandsPermission) {
          throw new Error('Plugin does not have ui:commands permission');
        }
        // Store command registration for later processing
        // This would integrate with OCLIF command system
        console.log(`Plugin registered command: ${command.name}`);
      },
      
      registerHook(event: HookEvent, handler: HookHandler): void {
        if (!hasHooksPermission) {
          throw new Error('Plugin does not have ui:hooks permission');
        }
        // Store hook registration
        this.eventBus.on(`hook:${event}`, handler);
      },
      
      showMessage(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        // Always allowed - safe operation
        const colors = {
          info: '\x1b[36m',     // cyan
          success: '\x1b[32m',  // green  
          warning: '\x1b[33m',  // yellow
          error: '\x1b[31m'     // red
        };
        const reset = '\x1b[0m';
        console.log(`${colors[type]}[Plugin] ${message}${reset}`);
      },
      
      async prompt(message: string, options?: any): Promise<any> {
        // Always allowed but sanitized
        const inquirer = await import('inquirer');
        return inquirer.default.prompt({
          type: options?.type || 'input',
          name: 'answer',
          message: `[Plugin] ${message}`,
          choices: options?.choices
        }).then(answers => answers.answer);
      }
    };
  }
  
  private createStorageAPI(pluginName: string): PluginStorageAPI {
    const storageDir = path.join(this.dataDir, pluginName, 'data');
    
    return {
      async get(key: string): Promise<any> {
        this.validateStorageKey(key);
        try {
          await fs.ensureDir(storageDir);
          const filePath = path.join(storageDir, `${key}.json`);
          if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
          }
          return undefined;
        } catch {
          return undefined;
        }
      },
      
      async set(key: string, value: any): Promise<void> {
        this.validateStorageKey(key);
        this.validateStorageValue(value);
        await fs.ensureDir(storageDir);
        const filePath = path.join(storageDir, `${key}.json`);
        await fs.writeJson(filePath, value, { spaces: 2 });
      },
      
      async delete(key: string): Promise<void> {
        this.validateStorageKey(key);
        const filePath = path.join(storageDir, `${key}.json`);
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
      },
      
      async clear(): Promise<void> {
        if (await fs.pathExists(storageDir)) {
          await fs.emptyDir(storageDir);
        }
      }
    };
  }
  
  private validateStorageKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Storage key must be a non-empty string');
    }
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new Error('Storage key cannot contain path separators');
    }
    if (key.length > 100) {
      throw new Error('Storage key too long (max 100 characters)');
    }
  }
  
  private validateStorageValue(value: any): void {
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > 1024 * 1024) { // 1MB limit
        throw new Error('Storage value too large (max 1MB)');
      }
    } catch {
      throw new Error('Storage value must be JSON serializable');
    }
  }
  
  private createEventBus(): PluginEventBus {
    return {
      on: (event, handler) => this.eventBus.on(event, handler),
      off: (event, handler) => this.eventBus.off(event, handler),
      emit: (event, ...args) => this.eventBus.emit(event, ...args)
    };
  }
}

interface LoadedPlugin {
  manifest: PluginManifest;
  plugin: BeelinePlugin;
  context: PluginContext;
  path: string;
  active: boolean;
}

// Global plugin manager instance
let pluginManagerInstance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager();
  }
  return pluginManagerInstance;
}