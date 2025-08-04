# 🔌 Plugin Development Guide

This comprehensive guide covers how to create, install, and distribute plugins for the Beeline Wallet plugin system.

## 📋 Table of Contents

1. [Quick Start](#-quick-start)
2. [Plugin Structure](#-plugin-structure)
3. [Plugin API Reference](#-plugin-api-reference)
4. [Installation and Management](#-installation-and-management)
5. [Examples](#-examples)
6. [Best Practices](#-best-practices)
7. [Testing Your Plugin](#-testing-your-plugin)
8. [Distribution](#-distribution)

## 🚀 Quick Start

Create your first plugin in 3 minutes:

### Step 1: Create Plugin Directory

```bash
mkdir my-awesome-plugin
cd my-awesome-plugin
```

### Step 2: Create `package.json`

```json
{
  "name": "my-awesome-plugin",
  "version": "1.0.0",
  "description": "An awesome plugin for Beeline wallet",
  "main": "index.js",
  "keywords": ["beeline", "hive", "plugin"],
  "author": "Your Name",
  "license": "MIT"
}
```

### Step 3: Create `index.js`

```javascript
// Simple "Hello World" plugin
const plugin = {
  name: 'my-awesome-plugin',
  description: 'My first Beeline plugin',
  version: '1.0.0',
  
  activate(context) {
    // Register a command
    context.addCommand('hello', 'Say hello to the user', async (args, flags) => {
      const name = args[0] || 'World';
      context.success(`Hello, ${name}! 🌟`);
      context.log('This is your first plugin command!');
    });
    
    context.success('My Awesome Plugin activated! 🎉');
    context.log('Try: beeline run-plugin hello [name]');
  }
};

module.exports = plugin;
```

### Step 4: Install and Test

```bash
# Install the plugin
beeline plugins install .

# Test your command
beeline run-plugin hello
beeline run-plugin hello Alice
```

## 🏗️ Plugin Structure

### Required Files

Every plugin must have these files:

```
my-plugin/
├── package.json     # Plugin metadata (required)
├── index.js         # Main plugin code (required)
└── README.md        # Documentation (recommended)
```

### Required Fields

#### `package.json` Requirements:
```json
{
  "name": "plugin-name",           // Required: Unique plugin identifier
  "version": "1.0.0",              // Required: Semantic version
  "description": "Plugin purpose", // Required: What the plugin does
  "main": "index.js",              // Required: Entry point file
  "keywords": ["beeline", "hive"], // Recommended: Searchability
  "author": "Your Name",           // Recommended: Attribution
  "license": "MIT"                 // Recommended: Legal clarity
}
```

#### `index.js` Requirements:
```javascript
const plugin = {
  name: 'plugin-name',        // Must match package.json name exactly
  description: 'Description', // Must be a non-empty string
  version: '1.0.0',          // Must match package.json version exactly
  
  // Required: Plugin initialization function
  activate(context) {
    // Your plugin code here
  },
  
  // Optional: Cleanup function (called when plugin is uninstalled)
  deactivate() {
    // Cleanup code here
  }
};

module.exports = plugin;
```

## 📚 Plugin API Reference

### Context Object

When your plugin's `activate()` function is called, it receives a `context` object with these methods:

#### Command Registration

```javascript
// Register a new command
context.addCommand(name, description, handler);

// Example:
context.addCommand('greet', 'Greet the user', async (args, flags) => {
  const name = args[0] || 'World';
  context.log(`Hello, ${name}!`);
});
```

**Parameters:**
- `name` (string): Command name (used with `beeline run-plugin <name>`)
- `description` (string): Help text shown in plugin listings
- `handler` (function): Async function that handles the command

**Handler Function Signature:**
```javascript
async function handler(args, flags) {
  // args: Array of command line arguments
  // flags: Object containing command line flags
}
```

#### UI Command Registration

For commands that create interactive terminal interfaces, use `addUICommand`:

```javascript
// Register a UI command
context.addUICommand(name, description, uiHandler);

// Example:
context.addUICommand('create-token', 'Interactive token creation wizard', async (args, flags, uiContext) => {
  const blessed = context.ui?.blessed;
  if (!blessed) {
    context.error('UI functionality not available');
    return;
  }
  
  // Create blessed.js UI
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Token Creator',
    fullUnicode: true
  });
  
  // ... UI implementation
});
```

**UI Handler Function Signature:**
```javascript
async function uiHandler(args, flags, uiContext) {
  // args: Array of command line arguments
  // flags: Object containing command line flags  
  // uiContext: Additional UI context (currently null, reserved for future use)
}
```

#### Logging Methods

```javascript
// Regular log message
context.log('Information message');

// Success message (green/styled)
context.success('✅ Operation completed successfully!');

// Error message (red/styled)
context.error('❌ Something went wrong');
```

#### Wallet Integration

```javascript
// Get current default account
const account = await context.wallet.getCurrentAccount();
// Returns: 'alice' or null if no default set

// Get list of all accounts
const accounts = await context.wallet.getAccountList();
// Returns: ['alice', 'bob', 'charlie']

// Get account balance
const balance = await context.wallet.getBalance('alice');
// Returns: { hive: '100.000 HIVE', hbd: '50.000 HBD', hp: '1500.000 HP' }

// Get balance for current account
const balance = await context.wallet.getBalance();

// 🚀 NEW: Broadcast custom JSON operations (blockchain transactions)
// Perfect for HiveEngine, NFTs, DeFi protocols, and custom smart contracts
const result = await context.wallet.broadcastCustomJson(
  'alice',                    // Account name
  'ssc-mainnet-hive',        // Contract ID (e.g., HiveEngine)
  {                          // JSON payload
    contractName: 'tokens',
    contractAction: 'transfer',
    contractPayload: {
      symbol: 'BEE',
      to: 'bob',
      quantity: '10.000'
    }
  },
  [],                        // Required active auths (empty for posting)
  ['alice']                  // Required posting auths
);
// Returns: { id: 'tx_hash', block_num: 12345, trx_num: 1 }

// The method automatically handles:
// - Key retrieval from secure vault
// - PIN prompting for encrypted keys (with proper masking)
// - Transaction signing and broadcasting
// - Error handling and user feedback
```

#### UI Utilities

Plugins can create interactive terminal interfaces using blessed.js:

```javascript
// Access blessed.js library
const blessed = context.ui?.blessed;

// Check if UI functionality is available
if (!context.ui?.blessed) {
  context.error('UI functionality not available');
  return;
}
```

**UI Context Properties:**
- `context.ui.blessed`: Direct access to blessed.js library
- `context.ui.createForm()`: Future helper for form creation (not yet implemented)
- `context.ui.showDialog()`: Future helper for dialogs (not yet implemented)
- `context.ui.showMenu()`: Future helper for menus (not yet implemented)

**blessed.js Integration Example:**
```javascript
context.addUICommand('my-form', 'Interactive form', async (args, flags, uiContext) => {
  const blessed = context.ui?.blessed;
  
  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    title: 'My Form',
    fullUnicode: true
  });

  // Create form
  const form = blessed.form({
    parent: screen,
    keys: true,
    left: 0,
    top: 0,
    width: '100%',
    height: '100%'
  });

  // Add input field
  const input = blessed.textbox({
    parent: form,
    name: 'name',
    top: 2,
    left: 2,
    width: '50%',
    height: 3,
    inputOnFocus: true,
    border: { type: 'line' },
    keys: true
  });

  // Add button
  const button = blessed.button({
    parent: form,
    top: 6,
    left: 2,
    width: 12,
    height: 3,
    content: 'Submit',
    border: { type: 'line' },
    keys: true,
    mouse: true
  });

  // Handle events
  button.on('press', () => {
    const value = input.getValue();
    context.success(`You entered: ${value}`);
    screen.destroy();
  });

  // Setup keyboard navigation
  screen.key(['tab'], () => {
    screen.focusNext();
  });

  screen.key(['escape', 'q', 'C-c'], () => {
    screen.destroy();
  });

  // Render and show
  screen.append(form);
  input.focus();
  screen.render();
});
```

### Plugin Lifecycle

```javascript
const plugin = {
  name: 'my-plugin',
  description: 'Plugin description',
  version: '1.0.0',
  
  // Called when plugin is installed/loaded
  activate(context) {
    // Register commands
    context.addCommand('my-command', 'Description', handler);
    
    // Plugin initialization
    context.success('Plugin loaded successfully!');
  },
  
  // Called when plugin is uninstalled (optional)
  deactivate() {
    // Cleanup resources
    // Close connections
    // Clear intervals/timeouts
  }
};
```

## 🛠️ Installation and Management

### Installing Plugins

#### From Local Directory:
```bash
# Install from current directory
beeline plugins install .

# Install from specific path
beeline plugins install /path/to/my-plugin
beeline plugins install ~/my-plugins/awesome-plugin
```

#### Plugin Location:
Plugins are installed to: `~/.beeline/plugins/`

### Managing Plugins

```bash
# List all installed plugins
beeline plugins list

# Uninstall plugin
beeline plugins uninstall plugin-name

# Run plugin commands
beeline run-plugin <command-name> [args]
```

## 💡 Examples

### Example 1: Simple Command Plugin

```javascript
// File: examples/simple-plugin/index.js
const plugin = {
  name: 'simple-plugin',
  description: 'Simple example plugin',
  version: '1.0.0',
  
  activate(context) {
    context.addCommand('echo', 'Echo back the input', async (args, flags) => {
      const message = args.join(' ') || 'Hello!';
      context.log(`Echo: ${message}`);
    });
    
    context.addCommand('whoami', 'Show current account', async (args, flags) => {
      const account = await context.wallet.getCurrentAccount();
      if (account) {
        context.success(`Current account: @${account}`);
      } else {
        context.error('No account set');
      }
    });
  }
};

module.exports = plugin;
```

### Example 2: Balance Checker Plugin

```javascript
// File: examples/balance-plugin/index.js
const plugin = {
  name: 'balance-plugin',
  description: 'Enhanced balance checking',
  version: '1.0.0',
  
  activate(context) {
    context.addCommand('balances', 'Show all account balances', async (args, flags) => {
      try {
        const accounts = await context.wallet.getAccountList();
        
        if (accounts.length === 0) {
          context.error('No accounts found');
          return;
        }
        
        context.success(`💰 ACCOUNT BALANCES\\n`);
        
        for (const account of accounts) {
          try {
            const balance = await context.wallet.getBalance(account);
            context.log(`@${account}:`);
            context.log(`  HIVE: ${balance.hive}`);
            context.log(`  HBD:  ${balance.hbd}`);
            context.log(`  HP:   ${balance.hp}`);
            context.log('');
          } catch (error) {
            context.error(`Failed to get balance for @${account}: ${error.message}`);
          }
        }
      } catch (error) {
        context.error(`Failed to get account list: ${error.message}`);
      }
    });
  }
};

module.exports = plugin;
```

### Example 3: API Integration Plugin

```javascript
// File: examples/api-plugin/index.js
const plugin = {
  name: 'api-plugin',
  description: 'External API integration example',
  version: '1.0.0',
  
  activate(context) {
    context.addCommand('weather', 'Get weather information', async (args, flags) => {
      const city = args[0] || 'London';
      
      try {
        context.log(`🌤️  Getting weather for ${city}...`);
        
        // Example API call (you'd need a real API key)
        const response = await fetch(`https://api.example.com/weather?city=${city}`);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        context.success(`Weather in ${city}:`);
        context.log(`Temperature: ${data.temperature}°C`);
        context.log(`Condition: ${data.condition}`);
        context.log(`Humidity: ${data.humidity}%`);
        
      } catch (error) {
        context.error(`Failed to get weather: ${error.message}`);
      }
    });
    
    context.addCommand('joke', 'Get a random joke', async (args, flags) => {
      try {
        const response = await fetch('https://api.chucknorris.io/jokes/random');
        const data = await response.json();
        
        context.success('😄 Random Joke:');
        context.log(data.value);
        
      } catch (error) {
        context.error(`Failed to get joke: ${error.message}`);
      }
    });
  }
};

module.exports = plugin;
```

### Example 4: Interactive UI Plugin

```javascript
// File: examples/ui-plugin/index.js
const plugin = {
  name: 'ui-plugin',
  description: 'Interactive UI example with forms and navigation',
  version: '1.0.0',
  
  activate(context) {
    // Regular command
    context.addCommand('user-info', 'Show user info via CLI', async (args, flags) => {
      const account = await context.wallet.getCurrentAccount();
      if (account) {
        const balance = await context.wallet.getBalance(account);
        context.success(`Account: @${account}`);
        context.log(`HIVE: ${balance.hive}`);
        context.log(`HBD: ${balance.hbd}`);
      } else {
        context.error('No account selected');
      }
    });

    // Interactive UI command
    context.addUICommand('user-form', 'Interactive user information form', async (args, flags, uiContext) => {
      const blessed = context.ui?.blessed;
      if (!blessed) {
        context.error('UI functionality not available - blessed.js not found');
        return;
      }

      // Create screen
      const screen = blessed.screen({
        smartCSR: true,
        title: 'User Information Form',
        fullUnicode: true
      });

      // Main container
      const container = blessed.box({
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        border: { type: 'line' },
        style: {
          fg: 'white',
          border: { fg: 'cyan' }
        }
      });

      // Form
      const form = blessed.form({
        parent: container,
        keys: true,
        left: 2,
        top: 2,
        width: '96%',
        height: '90%'
      });

      // Name input
      const nameLabel = blessed.text({
        parent: form,
        top: 0,
        left: 0,
        content: '{yellow-fg}Name:{/yellow-fg}',
        tags: true
      });

      const nameInput = blessed.textbox({
        parent: form,
        name: 'name',
        top: 1,
        left: 0,
        width: '100%',
        height: 3,
        border: { type: 'line' },
        inputOnFocus: true,
        keys: true,
        style: {
          focus: { border: { fg: 'cyan' } }
        }
      });

      // Email input
      const emailLabel = blessed.text({
        parent: form,
        top: 5,
        left: 0,
        content: '{magenta-fg}Email:{/magenta-fg}',
        tags: true
      });

      const emailInput = blessed.textbox({
        parent: form,
        name: 'email',
        top: 6,
        left: 0,
        width: '100%',
        height: 3,
        border: { type: 'line' },
        inputOnFocus: true,
        keys: true,
        style: {
          focus: { border: { fg: 'cyan' } }
        }
      });

      // Buttons
      const submitButton = blessed.button({
        parent: form,
        bottom: 2,
        left: 2,
        width: 12,
        height: 3,
        content: 'Submit',
        border: { type: 'line' },
        style: {
          bg: 'green',
          fg: 'black',
          focus: { bg: 'cyan', fg: 'black' }
        },
        keys: true,
        mouse: true
      });

      const cancelButton = blessed.button({
        parent: form,
        bottom: 2,
        right: 2,
        width: 12,
        height: 3,
        content: 'Cancel',
        border: { type: 'line' },
        style: {
          bg: 'red',
          fg: 'white',
          focus: { bg: 'cyan', fg: 'black' }
        },
        keys: true,
        mouse: true
      });

      // Event handlers
      submitButton.on('press', () => {
        const name = nameInput.getValue();
        const email = emailInput.getValue();
        
        screen.destroy();
        
        if (name && email) {
          context.success(`Form submitted successfully!`);
          context.log(`Name: ${name}`);
          context.log(`Email: ${email}`);
        } else {
          context.error('Please fill in all fields');
        }
      });

      cancelButton.on('press', () => {
        screen.destroy();
        context.log('Form cancelled');
      });

      // Tab navigation
      const tabOrder = [nameInput, emailInput, submitButton, cancelButton];
      let currentTabIndex = 0;

      screen.key(['tab'], () => {
        currentTabIndex = (currentTabIndex + 1) % tabOrder.length;
        tabOrder[currentTabIndex].focus();
        screen.render();
      });

      screen.key(['S-tab'], () => {
        currentTabIndex = (currentTabIndex - 1 + tabOrder.length) % tabOrder.length;
        tabOrder[currentTabIndex].focus();
        screen.render();
      });

      // Exit keys
      screen.key(['escape', 'C-c'], () => {
        screen.destroy();
        context.log('Form cancelled');
      });

      // Show form
      screen.append(container);
      nameInput.focus();
      screen.render();
    });

    context.success('UI Plugin loaded! 🎨');
    context.log('Commands:');
    context.log('  user-info  - CLI user info');
    context.log('  user-form  - Interactive form');
  }
};

module.exports = plugin;
```

## ✨ Best Practices

### 1. Error Handling

Always wrap API calls and async operations in try-catch blocks:

```javascript
context.addCommand('my-command', 'Description', async (args, flags) => {
  try {
    // Your code here
    const result = await someAsyncOperation();
    context.success('Operation completed!');
  } catch (error) {
    context.error(`Operation failed: ${error.message}`);
  }
});
```

### 2. Input Validation

Validate user inputs and provide helpful error messages:

```javascript
context.addCommand('send-message', 'Send a message', async (args, flags) => {
  const recipient = args[0];
  const message = args.slice(1).join(' ');
  
  if (!recipient) {
    context.error('Usage: send-message <recipient> <message>');
    return;
  }
  
  if (!message) {
    context.error('Message cannot be empty');
    return;
  }
  
  // Process the command...
});
```

### 3. User Feedback

Provide clear feedback for all operations:

```javascript
// Show progress
context.log('🔄 Processing request...');

// Show success
context.success('✅ Request processed successfully!');

// Show errors clearly
context.error('❌ Request failed: Invalid input');

// Provide helpful information
context.log('💡 Tip: Use --help for more information');
```

### 4. Resource Management

Clean up resources in the `deactivate()` method:

```javascript
const plugin = {
  name: 'my-plugin',
  description: 'Description',
  version: '1.0.0',
  
  activate(context) {
    // Store intervals/timeouts for cleanup
    this.intervalId = setInterval(() => {
      // Periodic task
    }, 5000);
  },
  
  deactivate() {
    // Clean up resources
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
};
```

### 5. Naming Conventions

- Use descriptive, kebab-case names for plugins: `hive-engine-plugin`, `price-tracker`
- Use clear, concise command names: `tokens`, `balance`, `price`
- Prefix related commands: `he-tokens`, `he-market`, `he-info`

### 6. Documentation

Include usage examples in your plugin activation:

```javascript
activate(context) {
  context.addCommand('my-command', 'Command description', handler);
  
  context.success('My Plugin loaded! 🎉');
  context.log('');
  context.log('Available commands:');
  context.log('  my-command <arg>    - Do something');
  context.log('  my-other <arg>      - Do something else');
  context.log('');
  context.log('Examples:');
  context.log('  beeline run-plugin my-command hello');
  context.log('  beeline run-plugin my-other world');
}
```

### 7. UI Best Practices

When creating interactive interfaces with blessed.js:

#### Essential Elements
```javascript
// Always check if UI is available
const blessed = context.ui?.blessed;
if (!blessed) {
  context.error('UI functionality not available');
  return;
}

// Set proper screen options
const screen = blessed.screen({
  smartCSR: true,
  title: 'Your App Title',
  fullUnicode: true
});
```

#### Keyboard Navigation
```javascript
// Add keys: true to all interactive elements
const input = blessed.textbox({
  keys: true,  // Essential for tab navigation
  inputOnFocus: true,
  // ... other options
});

// Implement tab navigation
const tabOrder = [input1, input2, button1, button2];
let currentTabIndex = 0;

screen.key(['tab'], () => {
  currentTabIndex = (currentTabIndex + 1) % tabOrder.length;
  tabOrder[currentTabIndex].focus();
  screen.render();
});

screen.key(['S-tab'], () => {
  currentTabIndex = (currentTabIndex - 1 + tabOrder.length) % tabOrder.length;
  tabOrder[currentTabIndex].focus();
  screen.render();
});
```

#### Exit Handling
```javascript
// Always provide exit keys
screen.key(['escape', 'q', 'C-c'], () => {
  screen.destroy();
  context.log('UI closed');
});

// Clean exit on button actions
button.on('press', () => {
  screen.destroy(); // Clean up the screen
  // Process the action
});
```

#### Form Validation
```javascript
// Validate inputs before processing
const name = nameInput.getValue().trim();
if (!name) {
  showMessage('Error', 'Name is required!', 'red');
  nameInput.focus();
  return;
}

// Character limits for inputs
nameInput.on('keypress', function(ch, key) {
  if (key && key.name !== 'backspace' && key.name !== 'delete') {
    if (this.getValue().length >= 50) {
      return false; // Prevent input
    }
  }
});
```

#### Styling and UX
```javascript
// Use consistent styling
const focusStyle = {
  border: { fg: 'cyan' },
  bg: 'blue',
  fg: 'white'
};

// Provide visual feedback
const input = blessed.textbox({
  style: {
    focus: focusStyle,
    border: { fg: 'gray' }
  }
});

// Clear instructions for users
const instructions = blessed.box({
  bottom: 0,
  content: '{center}TAB: Navigate | ENTER: Select | ESC: Cancel{/center}',
  tags: true
});
```

## 🧪 Testing Your Plugin

### Manual Testing

```bash
# Install your plugin
beeline plugins install .

# Test commands
beeline run-plugin my-command
beeline run-plugin my-command arg1 arg2

# Check plugin listing
beeline plugins list

# Uninstall and reinstall to test updates
beeline plugins uninstall my-plugin
beeline plugins install .
```

### Testing Checklist

- [ ] Plugin installs without errors
- [ ] All commands are registered correctly
- [ ] Commands handle arguments properly
- [ ] Error cases are handled gracefully
- [ ] Success/error messages are clear
- [ ] Plugin uninstalls cleanly
- [ ] No memory leaks or hanging resources

### Common Issues

1. **Plugin name mismatch**: Ensure `package.json` name matches plugin object name exactly
2. **Missing required fields**: All required fields must be present and non-empty
3. **Async handling**: Use proper async/await for all async operations
4. **Error handling**: Always catch and handle errors gracefully

## 📦 Distribution

### Sharing Your Plugin

1. **Create a Git Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial plugin version"
   git remote add origin https://github.com/yourusername/my-plugin
   git push -u origin main
   ```

2. **Installation Instructions:**
   ```bash
   # Clone and install
   git clone https://github.com/yourusername/my-plugin
   beeline plugins install my-plugin
   ```

3. **Documentation:**
   - Include a comprehensive README.md
   - Document all commands and their usage
   - Provide examples and screenshots
   - Include installation and uninstallation instructions

### Plugin Directory Structure for Distribution

```
my-awesome-plugin/
├── README.md                 # Plugin documentation
├── package.json             # Plugin metadata
├── index.js                 # Main plugin code
├── LICENSE                  # License file
├── examples/                # Usage examples
│   ├── basic-usage.md
│   └── advanced-usage.md
└── docs/                    # Additional documentation
    ├── api-reference.md
    └── troubleshooting.md
```

### README Template

```markdown
# My Awesome Plugin

Brief description of what your plugin does.

## Installation

```bash
git clone https://github.com/yourusername/my-awesome-plugin
beeline plugins install my-awesome-plugin
```

## Commands

### `command-name`
Description of the command.

**Usage:**
```bash
beeline run-plugin command-name [arguments]
```

**Examples:**
```bash
beeline run-plugin command-name example
```

## Contributing

Instructions for contributors.

## License

MIT License
```

## 🔧 Advanced Features

### Working with Multiple Commands

```javascript
const plugin = {
  name: 'advanced-plugin',
  description: 'Advanced plugin with multiple commands',
  version: '1.0.0',
  
  activate(context) {
    // Command with subcommands simulation
    context.addCommand('data', 'Data operations', async (args, flags) => {
      const subcommand = args[0];
      const subArgs = args.slice(1);
      
      switch (subcommand) {
        case 'get':
          await this.getData(context, subArgs);
          break;
        case 'set':
          await this.setData(context, subArgs);
          break;
        case 'list':
          await this.listData(context, subArgs);
          break;
        default:
          context.error('Usage: data <get|set|list> [args]');
      }
    });
  },
  
  async getData(context, args) {
    // Implementation
  },
  
  async setData(context, args) {
    // Implementation
  },
  
  async listData(context, args) {
    // Implementation
  }
};
```

### Configuration and Persistence

Plugins don't have built-in persistence, but you can use files or external storage:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const plugin = {
  name: 'config-plugin',
  description: 'Plugin with configuration',
  version: '1.0.0',
  
  activate(context) {
    this.configPath = path.join(os.homedir(), '.beeline', 'plugins', 'my-plugin-config.json');
    
    context.addCommand('set-config', 'Set configuration', async (args, flags) => {
      const [key, value] = args;
      if (!key || !value) {
        context.error('Usage: set-config <key> <value>');
        return;
      }
      
      try {
        const config = this.loadConfig();
        config[key] = value;
        this.saveConfig(config);
        context.success(`Configuration set: ${key} = ${value}`);
      } catch (error) {
        context.error(`Failed to save config: ${error.message}`);
      }
    });
  },
  
  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    } catch {
      return {};
    }
  },
  
  saveConfig(config) {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
};
```

## 🎯 Plugin Ideas

Here are some ideas for plugins you could create:

### Financial & Trading
- **Portfolio Tracker**: Track multiple accounts and calculate total portfolio value
- **Price Alerts**: Set price alerts for HIVE/HBD and get notifications
- **Trading Bot**: Automated trading on HiveEngine DEX
- **DeFi Dashboard**: Track liquidity pools, farming rewards, etc.

### Social & Content
- **Post Scheduler**: Schedule posts to the Hive blockchain
- **Comment Bot**: Automated comment responses
- **Follower Tracker**: Track follower growth and engagement
- **Content Analytics**: Analyze post performance and earnings

### Utility & Tools
- **Backup Manager**: Automated backup of account data and keys
- **Multi-Send**: Send tokens to multiple recipients at once
- **CSV Importer**: Import transaction data from CSV files
- **QR Code Generator**: Generate QR codes for easy payments

### Gaming & NFTs
- **Game Integration**: Connect with Hive-based games
- **NFT Gallery**: Display and manage NFT collections
- **Achievement Tracker**: Track gaming achievements across platforms

### Developer Tools
- **API Monitor**: Monitor Hive node health and performance
- **Transaction Builder**: Advanced transaction construction
- **Smart Contract Deployer**: Deploy contracts to HiveEngine
- **Blockchain Explorer**: Enhanced blockchain exploration tools

---

## 🤝 Contributing to Plugin Ecosystem

Have an idea for the plugin system? Want to contribute to the core functionality?

1. **Core Plugin System**: Submit PRs to improve the plugin architecture
2. **Example Plugins**: Contribute well-documented example plugins
3. **Documentation**: Help improve this documentation
4. **Plugin Directory**: Help create a plugin directory/marketplace

## 📞 Support

Need help with plugin development?

- **GitHub Issues**: Report bugs or request features
- **Hive Community**: Find me [@beggars](https://hive.blog/@beggars) on Hive
- **Documentation**: Check the main [README.md](README.md) for general usage

---

**Happy plugin development! 🚀**

*Build amazing extensions for the Beeline cyberpunk terminal wallet.*