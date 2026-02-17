import * as blessed from 'blessed';
import { KeyManager } from '../utils/crypto.js';
import { HiveClient, HiveTransaction, TransactionFilter, formatTransactionAmount, getTransactionDescription } from '../utils/hive.js';
import { getTheme, getCurrentThemeName, Theme, cleanAccountName, validateAmount, generateMockTxId } from '../utils/neon.js';

export interface UIOptions {
  mock?: boolean;
  node?: string;
}

type TransferStep = 'recipient' | 'amount' | 'currency' | 'memo' | 'preview' | 'pin' | 'processing';

interface TransferState {
  step: TransferStep;
  fromAccount: string;
  recipient: string;
  amount: string;
  currency: 'HIVE' | 'HBD';
  memo: string;
  needsPin: boolean;
}

type ClaimStep = 'preview' | 'pin' | 'processing';

interface ClaimState {
  step: ClaimStep;
  account: string;
  rewardHive: string;
  rewardHbd: string;
  rewardVests: string;
  needsPin: boolean;
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

  // Transfer wizard state
  private transferState: TransferState | null = null;
  private activeTextbox: blessed.Widgets.TextboxElement | null = null;
  private transferEscapeHandler: (() => void) | null = null;

  // Claim rewards wizard state
  private claimState: ClaimState | null = null;
  private claimEscapeHandler: (() => void) | null = null;

  // History screen state
  private historyFilter: string = 'monetary';

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
    // Quit: q and C-c always quit, escape only quits when not in wizard
    this.screen.key(['q', 'C-c'], () => {
      if (this.transferState || this.claimState) return;
      this.cleanup();
    });

    this.screen.key(['escape'], () => {
      if (this.transferState || this.claimState) return; // handled per-step
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

    // Quick access keys — all guarded during transfer/claim wizards
    this.screen.key(['d'], () => {
      if (this.transferState || this.claimState) return;
      this.showDashboard();
    });

    this.screen.key(['b'], () => {
      if (this.transferState || this.claimState) return;
      this.showBalance();
    });

    this.screen.key(['t'], () => {
      if (this.transferState || this.claimState) return;
      this.showTransfer();
    });

    this.screen.key(['a'], () => {
      if (this.transferState || this.claimState) return;
      this.showAccounts();
    });

    this.screen.key(['p'], () => {
      if (this.transferState || this.claimState) return;
      this.showPlugins();
    });

    this.screen.key(['r'], () => {
      if (this.transferState || this.claimState) return;
      this.refreshCurrentScreen();
    });

    this.screen.key(['h'], () => {
      if (this.transferState || this.claimState) return;
      this.showHistory();
    });

    this.screen.key(['k'], () => {
      if (this.transferState || this.claimState) return;
      this.showKeys();
    });

    this.screen.key(['c'], () => {
      if (this.transferState || this.claimState) return;
      this.showClaimRewards();
    });

    this.screen.key(['x'], () => {
      if (this.transferState || this.claimState) return;
      this.showRC();
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
    await this.updateFooter('D:Dash B:Bal T:Xfer H:Hist C:Claim X:RC K:Keys A:Acct P:Plug R:Refresh');

    // Set menu items
    const menuItems = [
      '{cyan-fg}[B] View Balance{/cyan-fg}',
      '{magenta-fg}[T] Transfer Funds{/magenta-fg}',
      '{green-fg}[H] Transaction History{/green-fg}',
      '{yellow-fg}[C] Claim Rewards{/yellow-fg}',
      '{cyan-fg}[X] RC Monitor{/cyan-fg}',
      '{blue-fg}[K] View Keys{/blue-fg}',
      '{yellow-fg}[A] Manage Accounts{/yellow-fg}',
      '{green-fg}[P] Plugin Commands{/green-fg}',
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

    // Validate prerequisites
    const defaultAccount = this.keyManager.getDefaultAccount();
    if (!defaultAccount) {
      await this.updateHeader('TRANSFER');
      await this.updateFooter('D: Dashboard');
      this.showError('No default account set. Use "beeline login <account>" first.');
      this.screen.render();
      return;
    }

    const keys = await this.keyManager.listKeys(defaultAccount);
    const activeKey = keys.find(k => k.role === 'active');
    if (!activeKey) {
      await this.updateHeader('TRANSFER');
      await this.updateFooter('D: Dashboard');
      this.showError(`No active key found for @${defaultAccount}. Import one with "beeline login".`);
      this.screen.render();
      return;
    }

    // Initialize wizard state
    this.transferState = {
      step: 'recipient',
      fromAccount: defaultAccount,
      recipient: '',
      amount: '',
      currency: 'HIVE',
      memo: '',
      needsPin: activeKey.encrypted
    };

    await this.updateHeader('TRANSFER');
    await this.updateFooter('Enter: Submit | ESC: Cancel');
    this.showTransferStep();
  }

  // ── Transfer Wizard: Step Router ──────────────────────────────────

  private showTransferStep(): void {
    if (!this.transferState) return;

    switch (this.transferState.step) {
      case 'recipient':
        this.transferStepRecipient();
        break;
      case 'amount':
        this.transferStepAmount();
        break;
      case 'currency':
        this.transferStepCurrency();
        break;
      case 'memo':
        this.transferStepMemo();
        break;
      case 'preview':
        this.transferStepPreview();
        break;
      case 'pin':
        this.transferStepPin();
        break;
      case 'processing':
        this.transferStepProcessing();
        break;
    }
  }

  private getTransferProgressText(): string {
    if (!this.transferState) return '';
    const s = this.transferState;
    const mode = this.mock ? '{yellow-fg}MOCK{/yellow-fg}' : '{green-fg}LIVE{/green-fg}';
    let text = `{magenta-fg}{bold}💸 TRANSFER FUNDS{/bold}{/magenta-fg}  [${mode}]

{white-fg}From: {cyan-fg}@${s.fromAccount}{/cyan-fg}{/white-fg}
`;
    if (s.recipient) text += `{white-fg}To:   {cyan-fg}@${s.recipient}{/cyan-fg}{/white-fg}\n`;
    if (s.amount) text += `{white-fg}Amount: {cyan-fg}${s.amount} ${s.currency}{/cyan-fg}{/white-fg}\n`;
    if (s.step === 'preview' || s.step === 'pin' || s.step === 'processing') {
      text += `{white-fg}Memo: {gray-fg}${s.memo || '(none)'}{/gray-fg}{/white-fg}\n`;
    }
    return text;
  }

  // ── Transfer Wizard: Individual Steps ─────────────────────────────

  private transferStepRecipient(): void {
    const progress = this.getTransferProgressText();
    this.infoBox.setContent(`${progress}
{yellow-fg}{bold}Step 1/4:{/bold} Enter recipient username{/yellow-fg}
{gray-fg}(without the @ prefix){/gray-fg}`);

    this.menuList.setItems(['{gray-fg}Type in the input box below...{/gray-fg}']);
    this.screen.render();

    this.createTextbox((value) => {
      if (!this.transferState) return;
      const cleaned = cleanAccountName(value.trim());
      if (!cleaned || cleaned.length < 3) {
        this.showTransferValidationError('Username must be at least 3 characters');
        return;
      }
      this.transferState.recipient = cleaned;
      this.transferState.step = 'amount';
      this.showTransferStep();
    }, () => {
      // Escape at step 1 cancels wizard
      this.cancelTransfer();
    });
  }

  private transferStepAmount(): void {
    const progress = this.getTransferProgressText();
    this.infoBox.setContent(`${progress}
{yellow-fg}{bold}Step 2/4:{/bold} Enter amount{/yellow-fg}
{gray-fg}(e.g. 1.000 or 10.5){/gray-fg}`);

    this.menuList.setItems(['{gray-fg}Type in the input box below...{/gray-fg}']);
    this.screen.render();

    this.createTextbox((value) => {
      if (!this.transferState) return;
      const result = validateAmount(value.trim());
      if (!result.valid) {
        this.showTransferValidationError((result as { valid: false; error: string }).error);
        return;
      }
      this.transferState.amount = (result as { valid: true; value: number }).value.toFixed(3);
      this.transferState.step = 'currency';
      this.showTransferStep();
    }, () => {
      // Go back to recipient
      if (this.transferState) {
        this.transferState.step = 'recipient';
        this.transferState.recipient = '';
        this.showTransferStep();
      }
    });
  }

  private transferStepCurrency(): void {
    if (!this.transferState) return;
    const progress = this.getTransferProgressText();
    this.infoBox.setContent(`${progress}
{yellow-fg}{bold}Step 3/4:{/bold} Select currency{/yellow-fg}`);

    this.menuList.setItems([
      '{cyan-fg}HIVE{/cyan-fg}',
      '{magenta-fg}HBD{/magenta-fg}'
    ]);
    this.menuList.select(this.transferState.currency === 'HBD' ? 1 : 0);
    this.menuList.focus();
    this.screen.render();

    this.addTransferEscapeHandler(() => {
      if (this.transferState) {
        this.transferState.step = 'amount';
        this.transferState.amount = '';
        this.removeTransferEscapeHandler();
        this.showTransferStep();
      }
    });

    // One-time select handler for currency
    const onSelect = (item: blessed.Widgets.BlessedElement) => {
      if (!this.transferState || this.transferState.step !== 'currency') return;
      this.menuList.removeListener('select', onSelect);
      this.removeTransferEscapeHandler();
      const text = item.getText().replace(/\{[^}]*\}/g, '');
      this.transferState.currency = text.trim() === 'HBD' ? 'HBD' : 'HIVE';
      this.transferState.step = 'memo';
      this.showTransferStep();
    };
    this.menuList.on('select', onSelect);
  }

  private transferStepMemo(): void {
    const progress = this.getTransferProgressText();
    this.infoBox.setContent(`${progress}
{yellow-fg}{bold}Step 4/4:{/bold} Enter memo (optional){/yellow-fg}
{gray-fg}Press Enter to skip{/gray-fg}`);

    this.menuList.setItems(['{gray-fg}Type in the input box below...{/gray-fg}']);
    this.screen.render();

    this.createTextbox((value) => {
      if (!this.transferState) return;
      this.transferState.memo = value.trim();
      this.transferState.step = 'preview';
      this.showTransferStep();
    }, () => {
      // Go back to currency
      if (this.transferState) {
        this.transferState.step = 'currency';
        this.showTransferStep();
      }
    });
  }

  private transferStepPreview(): void {
    if (!this.transferState) return;
    const s = this.transferState;
    const mode = this.mock ? '{yellow-fg}MOCK{/yellow-fg}' : '{red-fg}{bold}LIVE{/bold}{/red-fg}';
    this.infoBox.setContent(`{magenta-fg}{bold}💸 CONFIRM TRANSFER{/bold}{/magenta-fg}  [${mode}]

{white-fg}From:     {cyan-fg}@${s.fromAccount}{/cyan-fg}{/white-fg}
{white-fg}To:       {cyan-fg}@${s.recipient}{/cyan-fg}{/white-fg}
{white-fg}Amount:   {cyan-fg}${s.amount} ${s.currency}{/cyan-fg}{/white-fg}
{white-fg}Memo:     {gray-fg}${s.memo || '(none)'}{/gray-fg}{/white-fg}

${this.mock ? '{yellow-fg}This is a MOCK transfer — nothing will be broadcast.{/yellow-fg}' : '{red-fg}This will broadcast a REAL transaction!{/red-fg}'}`);

    this.menuList.setItems([
      '{green-fg}Confirm Transfer{/green-fg}',
      '{yellow-fg}Go Back{/yellow-fg}',
      '{red-fg}Cancel{/red-fg}'
    ]);
    this.menuList.select(0);
    this.menuList.focus();
    this.screen.render();

    this.addTransferEscapeHandler(() => {
      this.removeTransferEscapeHandler();
      if (this.transferState) {
        this.transferState.step = 'memo';
        this.showTransferStep();
      }
    });

    const onSelect = (item: blessed.Widgets.BlessedElement) => {
      if (!this.transferState || this.transferState.step !== 'preview') return;
      this.menuList.removeListener('select', onSelect);
      this.removeTransferEscapeHandler();
      const text = item.getText().replace(/\{[^}]*\}/g, '');

      if (text.includes('Confirm')) {
        if (!this.mock && this.transferState.needsPin) {
          this.transferState.step = 'pin';
          this.showTransferStep();
        } else {
          this.transferState.step = 'processing';
          this.showTransferStep();
        }
      } else if (text.includes('Go Back')) {
        this.transferState.step = 'memo';
        this.showTransferStep();
      } else {
        this.cancelTransfer();
      }
    };
    this.menuList.on('select', onSelect);
  }

  private transferStepPin(): void {
    const progress = this.getTransferProgressText();
    this.infoBox.setContent(`${progress}
{yellow-fg}{bold}Enter PIN to decrypt your active key{/yellow-fg}
{gray-fg}Your PIN is never stored or transmitted{/gray-fg}`);

    this.menuList.setItems(['{gray-fg}Type your PIN below...{/gray-fg}']);
    this.screen.render();

    this.createTextbox((value) => {
      if (!this.transferState) return;
      const pin = value.trim();
      if (!pin) {
        this.showTransferValidationError('PIN cannot be empty');
        return;
      }
      this.transferState.step = 'processing';
      this.executeTransfer(pin);
    }, () => {
      if (this.transferState) {
        this.transferState.step = 'preview';
        this.showTransferStep();
      }
    }, true); // censor=true for PIN
  }

  private transferStepProcessing(): void {
    if (!this.transferState) return;
    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Processing transfer...{/bold}{/cyan-fg}

{gray-fg}Please wait while the transaction is ${this.mock ? 'simulated' : 'broadcast'}...{/gray-fg}`);
    this.menuList.setItems([]);
    this.screen.render();

    if (this.mock) {
      // Simulate delay for mock mode
      setTimeout(() => {
        const mockTxId = generateMockTxId();
        this.showTransferResult(true, mockTxId, true);
      }, 1500);
    } else {
      this.executeTransfer();
    }
  }

  // ── Transfer Wizard: Execution ────────────────────────────────────

  private async executeTransfer(pin?: string): Promise<void> {
    if (!this.transferState) return;
    const s = this.transferState;

    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Broadcasting transfer...{/bold}{/cyan-fg}

{gray-fg}Signing and sending transaction...{/gray-fg}`);
    this.menuList.setItems([]);
    this.screen.render();

    try {
      const hiveClient = new HiveClient(this.keyManager, this.node);
      const txId = await hiveClient.transfer(
        s.fromAccount,
        s.recipient,
        s.amount,
        s.currency,
        s.memo,
        pin
      );
      // Scrub PIN from local scope
      if (pin) {
        this.keyManager.scrubMemory(pin);
      }
      this.showTransferResult(true, txId, false);
    } catch (error) {
      if (pin) {
        this.keyManager.scrubMemory(pin);
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.showTransferResult(false, msg, false);
    }
  }

  private async showTransferResult(success: boolean, data: string, isMock: boolean): Promise<void> {
    if (success) {
      const modeTag = isMock ? '{yellow-fg}(MOCK){/yellow-fg}' : '{green-fg}(LIVE){/green-fg}';
      this.infoBox.setContent(`{green-fg}{bold}✔ TRANSFER SUCCESSFUL{/bold}{/green-fg} ${modeTag}

{white-fg}Transaction ID:{/white-fg}
{cyan-fg}${data}{/cyan-fg}

{white-fg}From:   {cyan-fg}@${this.transferState?.fromAccount}{/cyan-fg}{/white-fg}
{white-fg}To:     {cyan-fg}@${this.transferState?.recipient}{/cyan-fg}{/white-fg}
{white-fg}Amount: {cyan-fg}${this.transferState?.amount} ${this.transferState?.currency}{/cyan-fg}{/white-fg}
${this.transferState?.memo ? `{white-fg}Memo:   {gray-fg}${this.transferState.memo}{/gray-fg}{/white-fg}` : ''}

{gray-fg}${new Date().toLocaleTimeString()}{/gray-fg}`);
    } else {
      this.infoBox.setContent(`{red-fg}{bold}✖ TRANSFER FAILED{/bold}{/red-fg}

{red-fg}${data}{/red-fg}

{yellow-fg}Check the error above and try again.{/yellow-fg}
{gray-fg}For invalid PIN errors, re-enter your PIN carefully.{/gray-fg}`);
    }

    // Clear wizard state before showing result menu
    this.transferState = null;

    this.menuList.setItems([
      '{magenta-fg}New Transfer{/magenta-fg}',
      '{cyan-fg}View Balance{/cyan-fg}',
      '{cyan-fg}Back to Dashboard{/cyan-fg}'
    ]);
    this.menuList.select(0);
    this.menuList.focus();
    await this.updateFooter('D: Dashboard | B: Balance | T: Transfer');
    this.screen.render();
  }

  // ── Transfer Wizard: Helpers ──────────────────────────────────────

  private createTextbox(
    onSubmit: (value: string) => void,
    onCancel: () => void,
    censor: boolean = false
  ): void {
    this.destroyActiveTextbox();

    const textbox = blessed.textbox({
      parent: this.contentBox,
      bottom: 1,
      left: 2,
      width: '50%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'white',
        border: { fg: 'yellow' },
        focus: { border: { fg: 'cyan' } }
      },
      inputOnFocus: true,
      censor
    });

    this.activeTextbox = textbox;

    textbox.on('submit', (value: string) => {
      onSubmit(value);
    });

    textbox.on('cancel', () => {
      onCancel();
    });

    textbox.focus();
    this.screen.render();
  }

  private destroyActiveTextbox(): void {
    if (this.activeTextbox) {
      this.activeTextbox.detach();
      this.activeTextbox.destroy();
      this.activeTextbox = null;
    }
  }

  private cancelTransfer(): void {
    this.destroyActiveTextbox();
    this.removeTransferEscapeHandler();
    this.transferState = null;
    this.showDashboard();
  }

  private showTransferValidationError(msg: string): void {
    if (!this.transferState) return;
    const step = this.transferState.step;
    this.infoBox.setContent(`${this.getTransferProgressText()}
{red-fg}{bold}✖ ${msg}{/bold}{/red-fg}
{gray-fg}Please try again.{/gray-fg}`);
    this.screen.render();

    // Re-show the current step after a brief flash
    setTimeout(() => {
      if (this.transferState && this.transferState.step === step) {
        this.showTransferStep();
      }
    }, 1200);
  }

  private addTransferEscapeHandler(handler: () => void): void {
    this.removeTransferEscapeHandler();
    this.transferEscapeHandler = handler;
    this.screen.onceKey('escape', handler);
  }

  private removeTransferEscapeHandler(): void {
    if (this.transferEscapeHandler) {
      this.screen.unkey('escape', this.transferEscapeHandler);
      this.transferEscapeHandler = null;
    }
  }

  // ── History Screen ─────────────────────────────────────────────────

  private static readonly HISTORY_FILTER_GROUPS: Record<string, string[]> = {
    monetary: [
      'transfer', 'transfer_to_vesting', 'withdraw_vesting',
      'transfer_to_savings', 'transfer_from_savings',
      'claim_reward_balance', 'author_reward', 'curation_reward',
      'interest', 'fill_vesting_withdraw', 'fill_transfer_from_savings'
    ],
    transfers: ['transfer', 'transfer_to_vesting', 'transfer_to_savings', 'transfer_from_savings'],
    rewards: ['author_reward', 'curation_reward', 'interest', 'claim_reward_balance'],
    power: ['transfer_to_vesting', 'withdraw_vesting', 'fill_vesting_withdraw'],
    savings: ['transfer_to_savings', 'transfer_from_savings', 'fill_transfer_from_savings', 'interest'],
    social: ['vote', 'comment', 'custom_json'],
    all: []
  };

  private async showHistory(): Promise<void> {
    this.currentScreen = 'history';
    await this.updateHeader('HISTORY');
    await this.updateFooter('H: History | R: Refresh | D: Dashboard | Arrow Keys: Navigate');

    const defaultAccount = this.keyManager.getDefaultAccount();
    if (!defaultAccount) {
      this.showError('No default account set. Please login first.');
      this.screen.render();
      return;
    }

    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Loading transaction history...{/bold}{/cyan-fg}`);
    this.menuList.setItems([]);
    this.screen.render();

    try {
      const filterTypes = TerminalUI.HISTORY_FILTER_GROUPS[this.historyFilter];
      const filter: TransactionFilter | undefined = filterTypes && filterTypes.length > 0
        ? { types: filterTypes }
        : undefined;

      let transactions: HiveTransaction[];

      if (this.mock) {
        transactions = this.getMockTransactions(defaultAccount);
      } else {
        const hiveClient = new HiveClient(this.keyManager, this.node);
        transactions = await hiveClient.getAccountHistory(defaultAccount, 100, -1, filter);
      }

      this.displayHistoryResults(transactions, defaultAccount);
    } catch (error) {
      this.showError(`Failed to load history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }

  private displayHistoryResults(transactions: HiveTransaction[], account: string): void {
    const filterLabel = this.historyFilter === 'all' ? 'All' :
      this.historyFilter.charAt(0).toUpperCase() + this.historyFilter.slice(1);

    if (transactions.length === 0) {
      this.infoBox.setContent(`{yellow-fg}{bold}⚠ NO TRANSACTIONS{/bold}{/yellow-fg}

{white-fg}No transactions found for @${account}{/white-fg}
{gray-fg}Filter: ${filterLabel}{/gray-fg}

{white-fg}Try a different filter or check that the{/white-fg}
{white-fg}account has blockchain activity.{/white-fg}`);
    } else {
      let content = `{cyan-fg}{bold}📜 TRANSACTION HISTORY{/bold}{/cyan-fg}
{white-fg}Account: {cyan-fg}@${account}{/cyan-fg} | Filter: {yellow-fg}${filterLabel}{/yellow-fg}{/white-fg}
{gray-fg}Showing ${Math.min(transactions.length, 20)} of ${transactions.length} transactions{/gray-fg}

`;
      const display = transactions.slice(0, 20);
      for (const tx of display) {
        const date = new Date(tx.timestamp);
        const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
        const desc = getTransactionDescription(tx, account);
        const opData = tx.op[1];

        let amountStr = '';
        if (opData.amount) {
          const fmt = formatTransactionAmount(opData.amount);
          amountStr = `{cyan-fg}${fmt.formatted} ${fmt.currency}{/cyan-fg}`;
        } else if (opData.reward) {
          const fmt = formatTransactionAmount(opData.reward);
          amountStr = `{cyan-fg}${fmt.formatted} ${fmt.currency}{/cyan-fg}`;
        } else if (opData.vesting_payout) {
          const fmt = formatTransactionAmount(opData.vesting_payout);
          amountStr = `{cyan-fg}${fmt.formatted} ${fmt.currency}{/cyan-fg}`;
        }

        // Direction indicator
        const isOutgoing = opData.from === account && opData.to && opData.to !== account;
        const isIncoming = opData.to === account && opData.from && opData.from !== account;
        const dir = isOutgoing ? '{red-fg}↑{/red-fg}' : isIncoming ? '{green-fg}↓{/green-fg}' : '{gray-fg}·{/gray-fg}';

        content += `{gray-fg}${dateStr}{/gray-fg} ${dir} {white-fg}${desc}{/white-fg}`;
        if (amountStr) content += ` ${amountStr}`;
        content += '\n';
      }

      if (transactions.length > 20) {
        content += `\n{gray-fg}... and ${transactions.length - 20} more{/gray-fg}`;
      }

      content += `\n{gray-fg}Updated: ${new Date().toLocaleTimeString()}{/gray-fg}`;
      if (this.mock) content += `\n{yellow-fg}Mode: MOCK DATA{/yellow-fg}`;

      this.infoBox.setContent(content);
    }

    // Filter menu items
    this.menuList.setItems([
      `{green-fg}[R] Refresh History{/green-fg}`,
      `{yellow-fg}${this.historyFilter === 'monetary' ? '▶ ' : '  '}Monetary{/yellow-fg}`,
      `{yellow-fg}${this.historyFilter === 'transfers' ? '▶ ' : '  '}Transfers Only{/yellow-fg}`,
      `{yellow-fg}${this.historyFilter === 'rewards' ? '▶ ' : '  '}Rewards Only{/yellow-fg}`,
      `{yellow-fg}${this.historyFilter === 'power' ? '▶ ' : '  '}Power Operations{/yellow-fg}`,
      `{yellow-fg}${this.historyFilter === 'savings' ? '▶ ' : '  '}Savings Operations{/yellow-fg}`,
      `{yellow-fg}${this.historyFilter === 'social' ? '▶ ' : '  '}Social Activity{/yellow-fg}`,
      `{yellow-fg}${this.historyFilter === 'all' ? '▶ ' : '  '}All Transactions{/yellow-fg}`,
      '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
    ]);
  }

  private handleHistoryFilterSelection(cleanText: string): void {
    let newFilter = this.historyFilter;
    if (cleanText.includes('All Transactions')) newFilter = 'all';
    else if (cleanText.includes('Monetary')) newFilter = 'monetary';
    else if (cleanText.includes('Transfers Only')) newFilter = 'transfers';
    else if (cleanText.includes('Rewards Only')) newFilter = 'rewards';
    else if (cleanText.includes('Power Operations')) newFilter = 'power';
    else if (cleanText.includes('Savings Operations')) newFilter = 'savings';
    else if (cleanText.includes('Social Activity')) newFilter = 'social';

    if (newFilter !== this.historyFilter) {
      this.historyFilter = newFilter;
      this.showHistory();
    }
  }

  private getMockTransactions(account: string): HiveTransaction[] {
    return [
      {
        trx_id: '4a1b2c3d4e5f',
        block: 87654321,
        trx_in_block: 5,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        op: ['transfer', { from: 'alice', to: account, amount: '10.000 HIVE', memo: 'Payment for services' }]
      },
      {
        trx_id: '5f6e7d8c9b0a',
        block: 87654300,
        trx_in_block: 12,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        op: ['transfer', { from: account, to: 'bob', amount: '5.500 HIVE', memo: 'Thanks!' }]
      },
      {
        trx_id: '6a7b8c9d0e1f',
        block: 87654290,
        trx_in_block: 3,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        op: ['transfer_to_vesting', { from: account, to: account, amount: '50.000 HIVE' }]
      },
      {
        trx_id: '',
        block: 87654280,
        trx_in_block: 0,
        op_in_trx: 0,
        virtual_op: 1,
        timestamp: new Date(Date.now() - 345600000).toISOString(),
        op: ['author_reward', { author: account, permlink: 'my-post', hive_payout: '5.234 HIVE', hbd_payout: '2.100 HBD', vesting_payout: '15.678 VESTS' }]
      },
      {
        trx_id: '9a8b7c6d5e4f',
        block: 87654250,
        trx_in_block: 8,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 432000000).toISOString(),
        op: ['transfer_to_savings', { from: account, to: account, amount: '100.000 HBD', memo: 'Long term savings' }]
      },
      {
        trx_id: '',
        block: 87654230,
        trx_in_block: 0,
        op_in_trx: 0,
        virtual_op: 1,
        timestamp: new Date(Date.now() - 518400000).toISOString(),
        op: ['curation_reward', { curator: account, reward: '0.450 VESTS', comment_author: 'carol', comment_permlink: 'great-article' }]
      },
      {
        trx_id: 'ab12cd34ef56',
        block: 87654200,
        trx_in_block: 2,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 604800000).toISOString(),
        op: ['claim_reward_balance', { account, reward_hive: '1.234 HIVE', reward_hbd: '0.567 HBD', reward_vests: '23.456 VESTS' }]
      },
      {
        trx_id: 'cd34ef56ab12',
        block: 87654180,
        trx_in_block: 6,
        op_in_trx: 0,
        virtual_op: 0,
        timestamp: new Date(Date.now() - 691200000).toISOString(),
        op: ['transfer', { from: 'dave', to: account, amount: '25.000 HBD', memo: 'HBD payment' }]
      }
    ];
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
    } else if (cleanText.includes('Transfer Funds') || cleanText.includes('New Transfer')) {
      this.showTransfer();
    } else if (cleanText.includes('Transaction History')) {
      this.showHistory();
    } else if (cleanText.includes('View Keys') || cleanText.includes('Refresh Keys')) {
      this.showKeys();
    } else if (cleanText.includes('Claim Rewards') || cleanText.includes('Refresh Rewards')) {
      this.showClaimRewards();
    } else if (cleanText.includes('RC Monitor') || cleanText.includes('Refresh RC')) {
      this.showRC();
    } else if (cleanText.includes('Manage Accounts') || cleanText.includes('Refresh Accounts')) {
      this.showAccounts();
    } else if (cleanText.includes('Plugin Commands')) {
      this.showPlugins();
    } else if (cleanText.includes('Back to Dashboard')) {
      this.showDashboard();
    } else if (cleanText.includes('Exit')) {
      this.cleanup();
    } else if (cleanText.includes('Retry') || cleanText.includes('Refresh History')) {
      this.refreshCurrentScreen();
    } else if (cleanText.includes('All Transactions') || cleanText.includes('Monetary')
      || cleanText.includes('Transfers Only') || cleanText.includes('Rewards Only')
      || cleanText.includes('Power Operations') || cleanText.includes('Savings Operations')
      || cleanText.includes('Social Activity')) {
      this.handleHistoryFilterSelection(cleanText);
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
      case 'history':
        this.showHistory();
        break;
      case 'keys':
        this.showKeys();
        break;
      case 'rewards':
        this.showClaimRewards();
        break;
      case 'rc':
        this.showRC();
        break;
      case 'accounts':
        this.showAccounts();
        break;
      case 'plugins':
        this.showPlugins();
        break;
    }
  }

  // ── View Keys Screen ─────────────────────────────────────────────

  private async showKeys(): Promise<void> {
    this.currentScreen = 'keys';
    await this.updateHeader('VIEW KEYS');
    await this.updateFooter('K: Keys | R: Refresh | D: Dashboard');

    try {
      const accountList = await this.keyManager.listAccounts();
      const defaultAccount = this.keyManager.getDefaultAccount();

      if (accountList.length === 0) {
        this.infoBox.setContent(`{yellow-fg}{bold}⚠ NO KEYS FOUND{/bold}{/yellow-fg}

{white-fg}No accounts or keys stored in wallet.{/white-fg}

{white-fg}To get started:{/white-fg}
{cyan-fg}$ beeline login <account>{/cyan-fg}

{gray-fg}Keys are stored in your OS keychain.{/gray-fg}`);

        this.menuList.setItems([
          '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
        ]);
      } else {
        let content = `{blue-fg}{bold}🔑 KEY VAULT{/bold}{/blue-fg}

`;
        let totalKeys = 0;
        let encryptedCount = 0;
        let osOnlyCount = 0;

        for (const accountName of accountList) {
          const keys = await this.keyManager.listKeys(accountName);
          const isDefault = accountName === defaultAccount;

          content += `{white-fg}@${accountName}${isDefault ? ' {yellow-fg}★ DEFAULT{/yellow-fg}' : ''}{/white-fg}\n`;

          if (keys.length === 0) {
            content += `{gray-fg}  (no keys){/gray-fg}\n`;
          } else {
            for (let i = 0; i < keys.length; i++) {
              const key = keys[i];
              const isLast = i === keys.length - 1;
              const branch = isLast ? '└─' : '├─';
              const encIcon = key.encrypted ? '◆' : '●';
              const encLabel = key.encrypted ? 'encrypted' : 'os-keychain';
              const pubKeyShort = key.publicKey.substring(0, 16) + '...';

              // Role coloring
              let roleColor = 'cyan';
              if (key.role === 'owner') roleColor = 'yellow';
              else if (key.role === 'active') roleColor = 'green';
              else if (key.role === 'posting') roleColor = 'cyan';
              else if (key.role === 'memo') roleColor = 'magenta';

              content += `{gray-fg}  ${branch} {/${roleColor}-fg}${encIcon}{/${roleColor}-fg} {${roleColor}-fg}${key.role.padEnd(8)}{/${roleColor}-fg} {gray-fg}${encLabel}  ${pubKeyShort}{/gray-fg}\n`;

              totalKeys++;
              if (key.encrypted) encryptedCount++;
              else osOnlyCount++;
            }
          }
          content += '\n';
        }

        content += `{gray-fg}── SECURITY SUMMARY ──{/gray-fg}
{white-fg}Total keys: {cyan-fg}${totalKeys}{/cyan-fg}{/white-fg}
{white-fg}PIN encrypted: {green-fg}${encryptedCount}{/green-fg} ◆{/white-fg}
{white-fg}OS keychain only: {yellow-fg}${osOnlyCount}{/yellow-fg} ●{/white-fg}`;

        this.infoBox.setContent(content);

        this.menuList.setItems([
          '{green-fg}[R] Refresh Keys{/green-fg}',
          '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
        ]);
      }
    } catch (error) {
      this.showError(`Failed to load keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }

  // ── Claim Rewards Screen ─────────────────────────────────────────

  private async showClaimRewards(): Promise<void> {
    this.currentScreen = 'rewards';
    await this.updateHeader('CLAIM REWARDS');
    await this.updateFooter('C: Claim | R: Refresh | D: Dashboard');

    const defaultAccount = this.keyManager.getDefaultAccount();
    if (!defaultAccount) {
      this.showError('No default account set. Please login first.');
      this.screen.render();
      return;
    }

    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Loading reward data...{/bold}{/cyan-fg}`);
    this.menuList.setItems([]);
    this.screen.render();

    try {
      let rewardHive: string;
      let rewardHbd: string;
      let rewardVests: string;

      if (this.mock) {
        rewardHive = '1.234';
        rewardHbd = '0.567';
        rewardVests = '23.456';
      } else {
        const hiveClient = new HiveClient(this.keyManager, this.node);
        const account = await hiveClient.getAccount(defaultAccount);
        if (!account) {
          this.showError(`Account @${defaultAccount} not found.`);
          this.screen.render();
          return;
        }
        rewardHive = account.reward_hive_balance.split(' ')[0];
        rewardHbd = account.reward_hbd_balance.split(' ')[0];
        rewardVests = account.reward_vesting_balance.split(' ')[0];
      }

      const hasRewards = parseFloat(rewardHive) > 0 || parseFloat(rewardHbd) > 0 || parseFloat(rewardVests) > 0;

      this.displayRewardPreview(defaultAccount, rewardHive, rewardHbd, rewardVests, hasRewards);
    } catch (error) {
      this.showError(`Failed to load rewards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }

  private displayRewardPreview(account: string, hive: string, hbd: string, vests: string, hasRewards: boolean): void {
    const mode = this.mock ? '{yellow-fg}MOCK{/yellow-fg}' : '{green-fg}LIVE{/green-fg}';

    let content = `{yellow-fg}{bold}🎁 PENDING REWARDS{/bold}{/yellow-fg}  [${mode}]

{white-fg}Account: {cyan-fg}@${account}{/cyan-fg}{/white-fg}

{white-fg}HIVE:  {cyan-fg}${parseFloat(hive).toFixed(3)}{/cyan-fg} HIVE{/white-fg}
{white-fg}HBD:   {magenta-fg}${parseFloat(hbd).toFixed(3)}{/magenta-fg} HBD{/white-fg}
{white-fg}VESTS: {green-fg}${parseFloat(vests).toFixed(3)}{/green-fg} VESTS{/white-fg}
`;

    if (!hasRewards) {
      content += `
{gray-fg}No pending rewards to claim.{/gray-fg}
{gray-fg}Rewards accumulate from posting and curating content.{/gray-fg}`;

      this.infoBox.setContent(content);
      this.menuList.setItems([
        '{green-fg}[R] Refresh Rewards{/green-fg}',
        '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
      ]);
    } else {
      content += `
{green-fg}Rewards are ready to claim!{/green-fg}`;

      this.infoBox.setContent(content);
      this.menuList.setItems([
        '{green-fg}Claim Rewards{/green-fg}',
        '{green-fg}[R] Refresh Rewards{/green-fg}',
        '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
      ]);

      // Store reward values for the claim wizard via one-time select handler
      const onSelect = (item: blessed.Widgets.BlessedElement) => {
        const text = item.getText().replace(/\{[^}]*\}/g, '');
        if (text.includes('Claim Rewards')) {
          this.menuList.removeListener('select', onSelect);
          this.startClaimWizard(account, hive, hbd, vests);
        }
        // Other selections handled by handleMenuSelection
      };
      this.menuList.on('select', onSelect);
    }
  }

  private async startClaimWizard(account: string, hive: string, hbd: string, vests: string): Promise<void> {
    // Check posting key exists (required for claim)
    const keys = await this.keyManager.listKeys(account);
    const postingKey = keys.find(k => k.role === 'posting');

    if (!postingKey) {
      this.showClaimValidationError(`No posting key found for @${account}. Import one with "beeline login".`);
      return;
    }

    this.claimState = {
      step: 'preview',
      account,
      rewardHive: hive,
      rewardHbd: hbd,
      rewardVests: vests,
      needsPin: postingKey.encrypted
    };

    if (!this.mock && this.claimState.needsPin) {
      this.claimState.step = 'pin';
      this.showClaimPinStep();
    } else {
      this.claimState.step = 'processing';
      this.executeClaimRewards();
    }
  }

  private async showClaimPinStep(): Promise<void> {
    if (!this.claimState) return;

    const mode = this.mock ? '{yellow-fg}MOCK{/yellow-fg}' : '{green-fg}LIVE{/green-fg}';
    this.infoBox.setContent(`{yellow-fg}{bold}🎁 CLAIM REWARDS{/bold}{/yellow-fg}  [${mode}]

{white-fg}Account: {cyan-fg}@${this.claimState.account}{/cyan-fg}{/white-fg}
{white-fg}HIVE:  {cyan-fg}${parseFloat(this.claimState.rewardHive).toFixed(3)}{/cyan-fg}{/white-fg}
{white-fg}HBD:   {magenta-fg}${parseFloat(this.claimState.rewardHbd).toFixed(3)}{/magenta-fg}{/white-fg}
{white-fg}VESTS: {green-fg}${parseFloat(this.claimState.rewardVests).toFixed(3)}{/green-fg}{/white-fg}

{yellow-fg}{bold}Enter PIN to decrypt your posting key{/yellow-fg}
{gray-fg}Your PIN is never stored or transmitted{/gray-fg}`);

    this.menuList.setItems(['{gray-fg}Type your PIN below...{/gray-fg}']);
    await this.updateFooter('Enter: Submit | ESC: Cancel');
    this.screen.render();

    this.createTextbox((value) => {
      if (!this.claimState) return;
      const pin = value.trim();
      if (!pin) {
        this.showClaimValidationError('PIN cannot be empty');
        return;
      }
      this.claimState.step = 'processing';
      this.executeClaimRewards(pin);
    }, () => {
      this.cancelClaim();
    }, true);
  }

  private async executeClaimRewards(pin?: string): Promise<void> {
    if (!this.claimState) return;
    const s = this.claimState;

    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Claiming rewards...{/bold}{/cyan-fg}

{gray-fg}Please wait while the transaction is ${this.mock ? 'simulated' : 'broadcast'}...{/gray-fg}`);
    this.menuList.setItems([]);
    this.screen.render();

    if (this.mock) {
      setTimeout(() => {
        const mockTxId = generateMockTxId();
        this.showClaimResult(true, mockTxId, true);
      }, 1500);
    } else {
      try {
        const hiveClient = new HiveClient(this.keyManager, this.node);
        const txId = await hiveClient.claimRewards(
          s.account,
          s.rewardHive,
          s.rewardHbd,
          s.rewardVests,
          pin
        );
        if (pin) this.keyManager.scrubMemory(pin);
        this.showClaimResult(true, txId, false);
      } catch (error) {
        if (pin) this.keyManager.scrubMemory(pin);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.showClaimResult(false, msg, false);
      }
    }
  }

  private async showClaimResult(success: boolean, data: string, isMock: boolean): Promise<void> {
    const claimed = this.claimState;

    if (success) {
      const modeTag = isMock ? '{yellow-fg}(MOCK){/yellow-fg}' : '{green-fg}(LIVE){/green-fg}';
      this.infoBox.setContent(`{green-fg}{bold}✔ REWARDS CLAIMED{/bold}{/green-fg} ${modeTag}

{white-fg}Transaction ID:{/white-fg}
{cyan-fg}${data}{/cyan-fg}

{white-fg}Claimed:{/white-fg}
{white-fg}  HIVE:  {cyan-fg}${claimed ? parseFloat(claimed.rewardHive).toFixed(3) : '?'}{/cyan-fg}{/white-fg}
{white-fg}  HBD:   {magenta-fg}${claimed ? parseFloat(claimed.rewardHbd).toFixed(3) : '?'}{/magenta-fg}{/white-fg}
{white-fg}  VESTS: {green-fg}${claimed ? parseFloat(claimed.rewardVests).toFixed(3) : '?'}{/green-fg}{/white-fg}

{gray-fg}${new Date().toLocaleTimeString()}{/gray-fg}`);
    } else {
      this.infoBox.setContent(`{red-fg}{bold}✖ CLAIM FAILED{/bold}{/red-fg}

{red-fg}${data}{/red-fg}

{yellow-fg}Check the error above and try again.{/yellow-fg}
{gray-fg}For invalid PIN errors, re-enter your PIN carefully.{/gray-fg}`);
    }

    this.claimState = null;

    this.menuList.setItems([
      '{yellow-fg}Claim Rewards{/yellow-fg}',
      '{cyan-fg}View Balance{/cyan-fg}',
      '{cyan-fg}Back to Dashboard{/cyan-fg}'
    ]);
    this.menuList.select(0);
    this.menuList.focus();
    await this.updateFooter('C: Claim | B: Balance | D: Dashboard');
    this.screen.render();
  }

  private cancelClaim(): void {
    this.destroyActiveTextbox();
    this.removeClaimEscapeHandler();
    this.claimState = null;
    this.showClaimRewards();
  }

  private showClaimValidationError(msg: string): void {
    this.infoBox.setContent(`{red-fg}{bold}✖ ${msg}{/bold}{/red-fg}

{gray-fg}Press any key to continue.{/gray-fg}`);
    this.menuList.setItems([
      '{green-fg}[R] Refresh Rewards{/green-fg}',
      '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
    ]);
    this.claimState = null;
    this.screen.render();
  }

  private addClaimEscapeHandler(handler: () => void): void {
    this.removeClaimEscapeHandler();
    this.claimEscapeHandler = handler;
    this.screen.onceKey('escape', handler);
  }

  private removeClaimEscapeHandler(): void {
    if (this.claimEscapeHandler) {
      this.screen.unkey('escape', this.claimEscapeHandler);
      this.claimEscapeHandler = null;
    }
  }

  // ── RC Monitor Screen ──────────────────────────────────────────────

  private async showRC(): Promise<void> {
    this.currentScreen = 'rc';
    await this.updateHeader('RC MONITOR');
    await this.updateFooter('X: RC | R: Refresh | D: Dashboard');

    const defaultAccount = this.keyManager.getDefaultAccount();
    if (!defaultAccount) {
      this.showError('No default account set. Please login first.');
      this.screen.render();
      return;
    }

    this.infoBox.setContent(`{cyan-fg}{bold}⠋ Loading RC data...{/bold}{/cyan-fg}`);
    this.menuList.setItems([]);
    this.screen.render();

    try {
      let current: number;
      let max: number;
      let percentage: number;

      if (this.mock) {
        max = 10_000_000_000;
        current = 7_500_000_000;
        percentage = 75.0;
      } else {
        const hiveClient = new HiveClient(this.keyManager, this.node);
        const rc = await hiveClient.getResourceCredits(defaultAccount);
        current = rc.current;
        max = rc.max;
        percentage = rc.percentage;
      }

      const mode = this.mock ? '{yellow-fg}MOCK{/yellow-fg}' : '{green-fg}LIVE{/green-fg}';
      const statusLabel = this.getRCStatusLabel(percentage);
      const statusColor = this.getRCStatusColor(percentage);
      const statusClose = this.getRCStatusCloseTag(percentage);
      const progressBar = this.buildRCProgressBar(percentage, statusColor, statusClose);

      // Transaction capacity estimates
      const RC_COST_TRANSFER = 13_000_000;
      const RC_COST_COMMENT = 200_000_000;
      const RC_COST_VOTE = 100_000_000;
      const transfers = Math.floor(current / RC_COST_TRANSFER);
      const comments = Math.floor(current / RC_COST_COMMENT);
      const votes = Math.floor(current / RC_COST_VOTE);

      // Regen estimate
      const pctRemaining = 100 - percentage;
      const daysToFull = pctRemaining > 0 ? (pctRemaining / 20).toFixed(1) : '0';

      const content = `{cyan-fg}{bold}⚡ RESOURCE CREDITS{/bold}{/cyan-fg}  [${mode}]

{white-fg}Account: {cyan-fg}@${defaultAccount}{/cyan-fg}{/white-fg}
{white-fg}Current RC: {cyan-fg}${this.formatRCNumber(current)}{/cyan-fg}{/white-fg}
{white-fg}Maximum RC: {cyan-fg}${this.formatRCNumber(max)}{/cyan-fg}{/white-fg}

{white-fg}RC Level:{/white-fg}
  ${progressBar} ${statusColor}${percentage.toFixed(1)}%${statusClose}

{white-fg}Status: ${statusColor}${statusLabel}${statusClose}{/white-fg}

{gray-fg}── TRANSACTION CAPACITY ──{/gray-fg}
{white-fg}Transfers: {cyan-fg}~${transfers.toLocaleString()}{/cyan-fg} remaining{/white-fg}
{white-fg}Comments:  {cyan-fg}~${comments.toLocaleString()}{/cyan-fg} remaining{/white-fg}
{white-fg}Votes:     {cyan-fg}~${votes.toLocaleString()}{/cyan-fg} remaining{/white-fg}

{gray-fg}RC regenerates ~20% per day (full in ${daysToFull} days){/gray-fg}
{gray-fg}Updated: ${new Date().toLocaleTimeString()}{/gray-fg}`;

      this.infoBox.setContent(content);

      this.menuList.setItems([
        '{green-fg}[R] Refresh RC{/green-fg}',
        '{cyan-fg}[D] Back to Dashboard{/cyan-fg}'
      ]);
    } catch (error) {
      this.showError(`Failed to load RC data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    this.screen.render();
  }

  private getRCStatusLabel(percentage: number): string {
    if (percentage >= 80) return 'EXCELLENT';
    if (percentage >= 50) return 'GOOD';
    if (percentage >= 20) return 'LOW';
    return 'CRITICAL';
  }

  private getRCStatusColor(percentage: number): string {
    if (percentage >= 80) return '{green-fg}';
    if (percentage >= 50) return '{cyan-fg}';
    if (percentage >= 20) return '{yellow-fg}';
    return '{red-fg}';
  }

  private getRCStatusCloseTag(percentage: number): string {
    if (percentage >= 80) return '{/green-fg}';
    if (percentage >= 50) return '{/cyan-fg}';
    if (percentage >= 20) return '{/yellow-fg}';
    return '{/red-fg}';
  }

  private buildRCProgressBar(percentage: number, colorOpen: string, colorClose: string): string {
    const barWidth = 20;
    const filled = Math.round((percentage / 100) * barWidth);
    const empty = barWidth - filled;
    const filledStr = '\u2588'.repeat(filled);
    const emptyStr = '\u2591'.repeat(empty);
    return `${colorOpen}[${filledStr}${emptyStr}]${colorClose}`;
  }

  private formatRCNumber(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toString();
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