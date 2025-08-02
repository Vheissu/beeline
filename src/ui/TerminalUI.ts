import * as blessed from 'blessed';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient } from '../utils/hive.js';

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

    this.setupUI();
    this.setupKeyBindings();
    this.showDashboard();
  }

  private setupUI(): void {
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
        fg: 'cyan',
        border: {
          fg: 'cyan'
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
        fg: 'white',
        border: {
          fg: 'magenta'
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
        fg: 'yellow',
        border: {
          fg: 'yellow'
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
        fg: 'white',
        border: {
          fg: 'cyan'
        },
        selected: {
          bg: 'cyan',
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
        fg: 'white',
        border: {
          fg: 'green'
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
      this.screen.destroy();
      process.exit(0);
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

    this.screen.key(['r'], () => {
      this.refreshCurrentScreen();
    });
  }

  private updateHeader(title: string): void {
    const mode = this.mock ? '{yellow-fg}(MOCK){/yellow-fg}' : '{green-fg}(LIVE){/green-fg}';
    const headerContent = `{bold}{cyan-fg}▓▓ BEELINE WALLET ▓▓{/cyan-fg}{/bold} → {magenta-fg}${title}{/magenta-fg} ${mode}`;
    this.headerBox.setContent(`  ${headerContent}  `);
  }

  private updateFooter(controls: string): void {
    const footerContent = `{bold}${controls}{/bold} | {yellow-fg}ESC/Q: Quit{/yellow-fg} | {cyan-fg}TAB: Focus{/cyan-fg}`;
    this.footerBox.setContent(`  ${footerContent}  `);
  }

  private async showDashboard(): Promise<void> {
    this.currentScreen = 'dashboard';
    this.updateHeader('DASHBOARD');
    this.updateFooter('D: Dashboard | B: Balance | T: Transfer | A: Accounts | R: Refresh');

    // Set menu items
    const menuItems = [
      '{cyan-fg}[B] View Balance{/cyan-fg}',
      '{magenta-fg}[T] Transfer Funds{/magenta-fg}',
      '{yellow-fg}[A] Manage Accounts{/yellow-fg}',
      '{green-fg}[K] View Keys{/green-fg}',
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
    this.updateHeader('BALANCE');
    this.updateFooter('R: Refresh | D: Dashboard | Arrow Keys: Navigate');

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
    this.updateHeader('TRANSFER');
    this.updateFooter('D: Dashboard | Use CLI for transfers: beeline transfer');

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
    this.updateHeader('ACCOUNTS');
    this.updateFooter('D: Dashboard | R: Refresh | Arrow Keys: Navigate');

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
    } else if (cleanText.includes('Back to Dashboard')) {
      this.showDashboard();
    } else if (cleanText.includes('Exit')) {
      this.screen.destroy();
      process.exit(0);
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
    }
  }

  public run(): void {
    this.screen.render();
  }
}