import * as blessed from 'blessed';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';
import { getTheme, getCurrentThemeName, Theme } from '../utils/neon.js';

export interface UIOptions {
  mock?: boolean;
  node?: string;
}

export class TerminalUI {
  private screen: blessed.Widgets.Screen;
  private keyManager: KeyManager;
  private currentScreen: string = 'dashboard';
  private mock: boolean;
  private node?: string;
  private theme: Theme | null = null;
  
  // UI Elements
  private headerBox: blessed.Widgets.BoxElement;
  private contentBox: blessed.Widgets.BoxElement;
  private footerBox: blessed.Widgets.BoxElement;
  private menuList: blessed.Widgets.ListElement;
  private infoBox: blessed.Widgets.BoxElement;

  constructor(keyManager: KeyManager, options: UIOptions = {}) {
    this.keyManager = keyManager;
    this.mock = options.mock || false;
    this.node = options.node;

    // Create main screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Beeline Wallet',
      fullUnicode: true
    });
  }

  public async initialize(): Promise<void> {
    await this.initializeTheme();
    await this.setupUI();
    this.setupKeyBindings();
    await this.showDashboard();
  }

  private async initializeTheme(): Promise<void> {
    this.theme = await getTheme();
  }

  private async getBlessedColors() {
    if (!this.theme) {
      // Fallback to default colors
      return {
        primary: 'cyan',
        secondary: 'magenta', 
        success: 'green',
        warning: 'yellow',
        error: 'red',
        info: 'cyan',
        accent: 'magenta',
        border: 'cyan',
        text: 'white'
      };
    }

    const themeName = await getCurrentThemeName();

    if (themeName === 'matrix') {
      return {
        primary: 'green',
        secondary: 'green',
        success: 'green',
        warning: 'green', 
        error: 'green',
        info: 'green',
        accent: 'green',
        border: 'green',
        text: 'white'
      };
    } else {
      // Cyberpunk theme
      return {
        primary: 'cyan',
        secondary: 'magenta',
        success: 'green',
        warning: 'yellow',
        error: 'red', 
        info: 'cyan',
        accent: 'magenta',
        border: 'cyan',
        text: 'white'
      };
    }
  }

  private async setupUI(): Promise<void> {
    const colors = await this.getBlessedColors();
    
    // Header
    this.headerBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: colors.primary,
        border: {
          fg: colors.border
        }
      }
    });

    // Content area
    this.contentBox = blessed.box({
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: colors.text,
        border: {
          fg: colors.secondary
        }
      }
    });

    // Footer
    this.footerBox = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: colors.warning,
        border: {
          fg: colors.warning
        }
      }
    });

    // Menu list
    this.menuList = blessed.list({
      parent: this.contentBox,
      top: 1,
      left: 2,
      width: '50%',
      height: '80%',
      items: [],
      keys: true,
      vi: true,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: colors.text,
        border: {
          fg: colors.primary
        },
        selected: {
          bg: colors.primary,
          fg: 'black'
        }
      }
    });

    // Info box
    this.infoBox = blessed.box({
      parent: this.contentBox,
      top: 1,
      right: 2,
      width: '45%',
      height: '80%',
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: colors.text,
        border: {
          fg: colors.success
        }
      }
    });

    // Append to screen
    this.screen.append(this.headerBox);
    this.screen.append(this.contentBox);
    this.screen.append(this.footerBox);

    // Focus the menu list
    this.menuList.focus();
  }

  private setupKeyBindings(): void {
    // Global key bindings
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.cleanup();
    });

    // Navigation keys
    this.screen.key(['tab'], () => {
      this.screen.focusNext();
    });

    this.screen.key(['S-tab'], () => {
      this.screen.focusPrevious();
    });

    // Menu selection
    this.menuList.on('select', (item: blessed.Widgets.BlessedElement) => {
      this.handleMenuSelection(item.getText());
    });

    // Quick access keys
    this.screen.key(['d'], () => {
      this.showDashboard();
    });

    this.screen.key(['b'], () => {
      this.showBalance();
    });

    this.screen.key(['t'], () => {
      this.showTransfer();
    });

    this.screen.key(['a'], () => {
      this.showAccounts();
    });

    this.screen.key(['p'], () => {
      this.showPlugins();
    });

    this.screen.key(['r'], () => {
      this.refreshCurrentScreen();
    });
  }

  private async updateHeader(title: string): Promise<void> {
    const colors = await this.getBlessedColors();
    const mode = this.mock ? `{${colors.warning}-fg}(MOCK){/${colors.warning}-fg}` : `{${colors.success}-fg}(LIVE){/${colors.success}-fg}`;
    const headerContent = `{bold}{${colors.primary}-fg}▓▓ BEELINE WALLET ▓▓{/${colors.primary}-fg}{/bold} → {${colors.accent}-fg}${title}{/${colors.accent}-fg} ${mode}`;
    this.headerBox.setContent(`  ${headerContent}  `);
  }

  private async updateFooter(controls: string): Promise<void> {
    const colors = await this.getBlessedColors();
    const footerContent = `{bold}${controls}{/bold} | {${colors.warning}-fg}ESC/Q: Quit{/${colors.warning}-fg} | {${colors.info}-fg}TAB: Focus{/${colors.info}-fg}`;
    this.footerBox.setContent(`  ${footerContent}  `);
  }

  private async showDashboard(): Promise<void> {
    this.currentScreen = 'dashboard';
    await this.updateHeader('DASHBOARD');
    await this.updateFooter('D: Dashboard | B: Balance | T: Transfer | A: Accounts | P: Plugins | R: Refresh');

    // Set menu items
    const menuItems = [
      '{cyan-fg}[B] View Balance{/cyan-fg}',
      '{magenta-fg}[T] Transfer Funds{/magenta-fg}',
      '{yellow-fg}[A] Manage Accounts{/yellow-fg}',
      '{green-fg}[P] Plugin Commands{/green-fg}',
      '{blue-fg}[K] View Keys{/blue-fg}',
      '{red-fg}[Q] Exit{/red-fg}'
    ];

    this.menuList.setItems(menuItems);

    // Load quick stats
    await this.loadQuickStats();
    this.screen.render();
  }

  private async loadQuickStats(): Promise<void> {
    try {
      const defaultAccount = this.keyManager.getDefaultAccount();
      
      if (!defaultAccount) {
        this.infoBox.setContent(`{yellow-fg}{bold}⚠ NO DEFAULT ACCOUNT{/bold}{/yellow-fg}

{white-fg}No account is currently set as default.{/white-fg}
{gray-fg}Use 'beeline login <account>' to add an account.{/gray-fg}`);
        return;
      }

      this.infoBox.setContent(`{cyan-fg}{bold}⠋ Loading account data...{/bold}{/cyan-fg}`);
      this.screen.render();

      if (this.mock) {
        // Mock data
        const mockStats = `{green-fg}{bold}★ QUICK STATS{/bold}{/green-fg}

{white-fg}Account: {cyan-fg}@${defaultAccount}{/cyan-fg}{/white-fg}
{white-fg}HIVE: {cyan-fg}1,234.567{/cyan-fg}{/white-fg}
{white-fg}HBD: {magenta-fg}89.123{/magenta-fg}{/white-fg}
{white-fg}HP: {green-fg}5,678.901{/green-fg}{/white-fg}

{gray-fg}Last updated: ${new Date().toLocaleTimeString()}{/gray-fg}
{yellow-fg}Mode: MOCK DATA{/yellow-fg}`;

        this.infoBox.setContent(mockStats);
      } else {
        const hiveClient = new HiveClient(this.keyManager, this.node);
        const balances = await hiveClient.getBalance(defaultAccount);
        const nodeInfo = await hiveClient.getNodeInfo();

        const formatBalance = (amount: string) => {
          const num = parseFloat(amount);
          return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        };

        const liveStats = `{green-fg}{bold}★ QUICK STATS{/bold}{/green-fg}

{white-fg}Account: {cyan-fg}@${defaultAccount}{/cyan-fg}{/white-fg}
{white-fg}HIVE: {cyan-fg}${formatBalance(balances.hive)}{/cyan-fg}{/white-fg}
{white-fg}HBD: {magenta-fg}${formatBalance(balances.hbd)}{/magenta-fg}{/white-fg}
{white-fg}HP: {green-fg}${formatBalance(balances.hp)}{/green-fg}{/white-fg}

{gray-fg}Block: #${nodeInfo.lastBlockNum.toLocaleString()}{/gray-fg}
{gray-fg}Node: ${nodeInfo.url}{/gray-fg}
{gray-fg}Updated: ${new Date().toLocaleTimeString()}{/gray-fg}`;

        this.infoBox.setContent(liveStats);
      }
    } catch (error) {
      this.infoBox.setContent(`{red-fg}{bold}✖ ERROR{/bold}{/red-fg}

{red-fg}Failed to load account data:{/red-fg}
{white-fg}${error instanceof Error ? error.message : 'Unknown error'}{/white-fg}

{yellow-fg}Try refreshing with 'R' or use mock mode{/yellow-fg}`);
    }
  }

  private async showBalance(): Promise<void> {
    this.currentScreen = 'balance';
    await this.updateHeader('BALANCE');
    await this.updateFooter('R: Refresh | D: Dashboard | Arrow Keys: Navigate');

    const defaultAccount = this.keyManager.getDefaultAccount();
    if (!defaultAccount) {
      this.showError('No default account set. Please login first.');
      return;
    }

    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Loading balance data...{/bold}{/cyan-fg}`);
    this.screen.render();

    try {
      if (this.mock) {
        const mockBalance = `{cyan-fg}{bold}💰 WALLET BALANCE{/bold}{/cyan-fg}
{white-fg}Account: {cyan-fg}@${defaultAccount}{/cyan-fg}{/white-fg}

{cyan-fg}{bold}MAIN BALANCES{/bold}{/cyan-fg}
{white-fg}HIVE     → {cyan-fg}1,234.567{/cyan-fg} HIVE{/white-fg}
{white-fg}HBD      → {magenta-fg}89.123{/magenta-fg} HBD{/white-fg}
{white-fg}HP       → {green-fg}5,678.901{/green-fg} HP{/white-fg}

{gray-fg}{bold}SAVINGS{/bold}{/gray-fg}
{white-fg}├─ HIVE  → {cyan-fg}100.000{/cyan-fg} HIVE{/white-fg}
{white-fg}└─ HBD   → {magenta-fg}250.500{/magenta-fg} HBD{/white-fg}

{yellow-fg}Mode: MOCK DATA{/yellow-fg}`;

        this.infoBox.setContent(mockBalance);
      } else {
        const hiveClient = new HiveClient(this.keyManager, this.node);
        const balances = await hiveClient.getBalance(defaultAccount);
        const nodeInfo = await hiveClient.getNodeInfo();

        const formatBalance = (amount: string) => {
          const num = parseFloat(amount);
          return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        };

        const liveBalance = `{cyan-fg}{bold}💰 WALLET BALANCE{/bold}{/cyan-fg}
{white-fg}Account: {cyan-fg}@${defaultAccount}{/cyan-fg}{/white-fg}

{cyan-fg}{bold}MAIN BALANCES{/bold}{/cyan-fg}
{white-fg}HIVE     → {cyan-fg}${formatBalance(balances.hive)}{/cyan-fg} HIVE{/white-fg}
{white-fg}HBD      → {magenta-fg}${formatBalance(balances.hbd)}{/magenta-fg} HBD{/white-fg}
{white-fg}HP       → {green-fg}${formatBalance(balances.hp)}{/green-fg} HP{/white-fg}

{gray-fg}{bold}SAVINGS{/bold}{/gray-fg}
{white-fg}├─ HIVE  → {cyan-fg}${formatBalance(balances.savings_hive)}{/cyan-fg} HIVE{/white-fg}
{white-fg}└─ HBD   → {magenta-fg}${formatBalance(balances.savings_hbd)}{/magenta-fg} HBD{/white-fg}

{gray-fg}Block: #${nodeInfo.lastBlockNum.toLocaleString()}{/gray-fg}
{gray-fg}Node: ${nodeInfo.url}{/gray-fg}
{gray-fg}Updated: ${new Date().toLocaleTimeString()}{/gray-fg}`;

        this.infoBox.setContent(liveBalance);
      }

      // Update menu for balance actions
      this.menuList.setItems([
        '{green-fg}[R] Refresh Balance{/green-fg}',
        '{magenta-fg}[T] Transfer Funds{/magenta-fg}',
        '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
      ]);

    } catch (error) {
      this.showError(`Failed to load balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }

  private async showTransfer(): Promise<void> {
    this.currentScreen = 'transfer';
    await this.updateHeader('TRANSFER');
    await this.updateFooter('D: Dashboard | Use CLI for transfers: beeline transfer');

    const transferInfo = `{magenta-fg}{bold}💸 TRANSFER FUNDS{/bold}{/magenta-fg}

{yellow-fg}Transfer functionality is available via CLI:{/yellow-fg}

{white-fg}For HIVE transfers:{/white-fg}
{cyan-fg}$ beeline transfer @recipient 10 HIVE "memo"{/cyan-fg}

{white-fg}For HBD transfers:{/white-fg}
{cyan-fg}$ beeline transfer @recipient 5 HBD "memo"{/cyan-fg}

{white-fg}For testing (mock mode):{/white-fg}
{cyan-fg}$ beeline transfer @recipient 1 HIVE --mock{/cyan-fg}

{yellow-fg}Interactive transfer UI coming soon!{/yellow-fg}

{gray-fg}Current mode: ${this.mock ? 'MOCK' : 'LIVE'}{/gray-fg}`;

    this.infoBox.setContent(transferInfo);
    
    this.menuList.setItems([
      '{cyan-fg}[D] Back to Dashboard{/cyan-fg}',
      '{yellow-fg}[B] View Balance{/yellow-fg}'
    ]);

    this.screen.render();
  }

  private async showAccounts(): Promise<void> {
    this.currentScreen = 'accounts';
    await this.updateHeader('ACCOUNTS');
    await this.updateFooter('D: Dashboard | R: Refresh | Arrow Keys: Navigate');

    try {
      const accountList = await this.keyManager.listAccounts();
      const defaultAccount = this.keyManager.getDefaultAccount();

      if (accountList.length === 0) {
        this.infoBox.setContent(`{yellow-fg}{bold}⚠ NO ACCOUNTS{/bold}{/yellow-fg}

{white-fg}No accounts found in wallet.{/white-fg}

{white-fg}To add an account:{/white-fg}
{cyan-fg}$ beeline login <account>{/cyan-fg}

{white-fg}To import keys:{/white-fg}
{cyan-fg}$ beeline keys import <account> <role>{/cyan-fg}`);
      } else {
        let accountInfo = `{yellow-fg}{bold}👥 ACCOUNT MANAGEMENT{/bold}{/yellow-fg}

{white-fg}Found ${accountList.length} account${accountList.length !== 1 ? 's' : ''}:{/white-fg}

`;

        for (const accountName of accountList) {
          const keys = await this.keyManager.listKeys(accountName);
          const isDefault = accountName === defaultAccount;
          const keyTypes = keys.map(k => k.role).join(', ');
          
          accountInfo += `{white-fg}@${accountName}${isDefault ? ' {yellow-fg}★ DEFAULT{/yellow-fg}' : ''}{/white-fg}
{gray-fg}  Keys: ${keyTypes || 'None'}{/gray-fg}

`;
        }

        accountInfo += `{gray-fg}Use CLI commands to manage accounts:{/gray-fg}
{cyan-fg}$ beeline accounts list{/cyan-fg}
{cyan-fg}$ beeline accounts switch <account>{/cyan-fg}`;

        this.infoBox.setContent(accountInfo);
      }

      this.menuList.setItems([
        '{green-fg}[R] Refresh Accounts{/green-fg}',
        '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
      ]);

    } catch (error) {
      this.showError(`Failed to load accounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }

  private showError(message: string): void {
    this.infoBox.setContent(`{red-fg}{bold}✖ ERROR{/bold}{/red-fg}

{red-fg}${message}{/red-fg}

{yellow-fg}Press 'D' to return to dashboard{/yellow-fg}`);
    
    this.menuList.setItems([
      '{cyan-fg}[D] Back to Dashboard{/cyan-fg}',
      '{green-fg}[R] Retry{/green-fg}'
    ]);
  }

  private handleMenuSelection(selectedText: string): void {
    // Remove color codes and extract the action
    const cleanText = selectedText.replace(/\{[^}]*\}/g, '');
    
    if (cleanText.includes('View Balance') || cleanText.includes('Refresh Balance')) {
      this.showBalance();
    } else if (cleanText.includes('Transfer Funds')) {
      this.showTransfer();
    } else if (cleanText.includes('Manage Accounts') || cleanText.includes('Refresh Accounts')) {
      this.showAccounts();
    } else if (cleanText.includes('Plugin Commands')) {
      this.showPlugins();
    } else if (cleanText.includes('Back to Dashboard')) {
      this.showDashboard();
    } else if (cleanText.includes('Exit')) {
      this.cleanup();
    } else if (cleanText.includes('Retry')) {
      this.refreshCurrentScreen();
    }
  }

  private refreshCurrentScreen(): void {
    switch (this.currentScreen) {
      case 'dashboard':
        this.showDashboard();
        break;
      case 'balance':
        this.showBalance();
        break;
      case 'transfer':
        this.showTransfer();
        break;
      case 'accounts':
        this.showAccounts();
        break;
      case 'plugins':
        this.showPlugins();
        break;
    }
  }

  private async showPlugins(): Promise<void> {
    this.currentScreen = 'plugins';
    await this.updateHeader('PLUGIN COMMANDS');
    await this.updateFooter('D: Dashboard | R: Refresh | Enter: Execute');

    try {
      // Import plugin manager
      const { getPluginManager } = await import('../utils/simple-plugins.js');
      const pluginManager = getPluginManager();
      await pluginManager.initialize();

      const commands = pluginManager.getCommands();
      
      if (commands.size === 0) {
        this.infoBox.setContent(`{yellow-fg}{bold}⚠ NO PLUGINS LOADED{/bold}{/yellow-fg}

{white-fg}No plugin commands available.{/white-fg}

{white-fg}To install plugins:{/white-fg}
{cyan-fg}$ beeline plugins install <path>{/cyan-fg}

{white-fg}Available built-in examples:{/white-fg}
{cyan-fg}$ beeline plugins install examples/hiveengine-plugin{/cyan-fg}
{cyan-fg}$ beeline plugins install examples/price-tracker-plugin{/cyan-fg}

{gray-fg}After installation, plugin commands will appear here.{/gray-fg}`);

        this.menuList.setItems([
          '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
        ]);
      } else {
        let pluginInfo = `{green-fg}{bold}🔌 AVAILABLE PLUGIN COMMANDS{/bold}{/green-fg}

{white-fg}Found ${commands.size} plugin command${commands.size !== 1 ? 's' : ''}:{/white-fg}

`;

        const menuItems: string[] = [];
        const commandArray = Array.from(commands.entries());
        
        for (const [name, cmd] of commandArray) {
          const isUI = cmd.isUI ? ' {yellow-fg}(UI){/yellow-fg}' : '';
          pluginInfo += `{white-fg}${name}${isUI}{/white-fg}\n{gray-fg}  ${cmd.description} (${cmd.pluginName}){/gray-fg}\n\n`;
          menuItems.push(`{cyan-fg}${name}{/cyan-fg} - ${cmd.description}`);
        }

        pluginInfo += `{gray-fg}Use CLI to execute commands:{/gray-fg}
{cyan-fg}$ beeline run-plugin <command> [args]{/cyan-fg}

{yellow-fg}Current mode: ${this.mock ? 'MOCK - Safe for testing' : 'LIVE - Real operations'}{/yellow-fg}`;

        this.infoBox.setContent(pluginInfo);
        
        menuItems.push('{blue-fg}[D] Back to Dashboard{/blue-fg}');
        this.menuList.setItems(menuItems);
      }

    } catch (error) {
      this.showError(`Failed to load plugins: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }


  private cleanup(): void {
    try {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      this.screen.destroy();
    } catch (error) {
      // Ignore cleanup errors
    }
    process.exit(0);
  }

  public run(): void {
    this.screen.render();
    
    // Keep the process alive
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
  }
}