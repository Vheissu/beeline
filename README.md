```
╔════════════════════════════════════════════════════════════════════╗
║  H I V E   T E R M I N A L   W A L L E T                           ║
╚════════════════════════════════════════════════════════════════════╝
```

# 🌈 beeline

**A cyberpunk terminal wallet for the Hive blockchain**

*Type, sign, rule the chain – all within the neon grid.*

[![npm version](https://img.shields.io/npm/v/beeline-cli.svg)](https://www.npmjs.com/package/beeline-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ⚡ Features

- 🌈 **Cyberpunk Aesthetic** - Full neon color palette with ASCII art and animated effects
- 🔐 **Secure Key Management** - PIN-encrypted key storage with OS keychain integration
- 🚀 **Password-Based Login** - Derive all keys from your master Hive password
- 👥 **Multiple Account Support** - Manage unlimited Hive accounts in one wallet
- 💰 **Complete Blockchain Operations** - Transfers, power up/down, savings (20% APR), reward claiming, RC monitoring
- 🛡️ **Security First** - Memory scrubbing, encrypted storage, zero-click paranoia
- 📱 **Terminal Native** - Pure command line interface with neon styling
- 🎮 **Mock Mode** - Test all operations safely before going live

## 🚀 Quick Start

### Installation

```bash
npm install -g beeline-cli
```

### First Time Setup

```bash
# Login with your Hive account (initializes wallet automatically)
beeline login alice

# Check your balance
beeline balance

# Send a transfer
beeline transfer @bob 1 HIVE "Welcome to the neon grid!"
```

## 🎯 Core Commands

### 🔑 Account Management

```bash
# Login with master password (initializes wallet on first use)
beeline login alice                    # Import posting, active, memo keys
beeline login alice --roles active    # Import only active key
beeline login alice --no-pin          # Skip PIN encryption

# View all accounts
beeline accounts list

# Switch default account
beeline accounts switch alice

# View account details
beeline accounts info alice

# Remove account (with confirmation)
beeline accounts remove alice
```

### 🔐 Key Management

```bash
# View all keys in vault
beeline keys list

# Import individual key (advanced users)
beeline keys import alice posting     # Will prompt for private key WIF

# Remove specific key
beeline keys remove alice posting

# Set default account
beeline keys set-default alice
```

### 💰 Wallet Operations

#### **Balance Checking**
```bash
# Check balance
beeline balance                        # Use default account
beeline balance alice                  # Specific account  
beeline balance @alice                 # @ prefix optional
beeline balance alice --format json   # JSON output
beeline balance alice --mock          # Test with mock data (safe)
```

#### **Transfers with Memos**
```bash
# Basic transfers
beeline transfer @bob 10 HIVE                    # No memo
beeline transfer @alice 5.000 HBD               # No memo, precise amount

# Transfers with memos (optional)
beeline transfer @bob 10 HIVE "Hello friend!"          # Personal message
beeline transfer @alice 5 HBD "Payment for coffee"     # Payment reference
beeline transfer @charlie 1.000 HIVE "Invoice #123"    # Business reference

# Multi-account transfers
beeline transfer @customer 100 HIVE "Order #456" --from @business
beeline transfer @friend 0.001 HIVE "Testing" --from @testaccount

# Safe testing (recommended first!)
beeline transfer @bob 10 HIVE "Test message" --mock
beeline transfer @alice 5 HBD --mock                    # Mock without memo

# Skip confirmation prompts (for automation)
beeline transfer @recipient 1 HIVE "Automated payment" --confirm
```

#### **Transfer Examples by Use Case**
```bash
# Personal payments
beeline transfer @friend 5 HIVE "Thanks for dinner!"
beeline transfer @sibling 10 HBD "Birthday gift"

# Business transactions  
beeline transfer @supplier 250 HIVE "Invoice #2024-001" --from @company
beeline transfer @employee 50 HBD "Salary bonus" --from @business

# Content creator tips
beeline transfer @blogger 1 HIVE "Great article!"
beeline transfer @artist 2 HBD "Love your work!"

# Testing and development
beeline transfer @testaccount 0.001 HIVE "Connection test" --mock
beeline transfer @any 999 HIVE "Safe testing" --mock
```

### 🎮 Development & Testing

```bash
# Show version and system info
beeline version

# Get help for any command
beeline --help                # Show all commands
beeline help login            # Detailed help for login
beeline transfer --help       # Transfer command options
beeline accounts --help       # Account management help
beeline keys --help          # Key management help
```

### 🔍 Complete Command Reference

#### **Account Management Commands**
```bash
# Login (creates wallet on first use)
beeline login alice                    # Login with all keys (posting, active, memo)
beeline login alice --roles posting   # Login with specific key only
beeline login alice --no-pin          # Skip PIN encryption (less secure)
beeline login alice --no-verify       # Skip blockchain verification
beeline login alice --force           # Overwrite existing keys

# Account operations
beeline accounts list                  # View all accounts
beeline accounts list --format json   # JSON output
beeline accounts switch alice          # Set default account
beeline accounts info alice            # Detailed account info
beeline accounts remove alice          # Remove account (with confirmation)
beeline accounts remove alice --force  # Remove without confirmation
```

#### **Key Management Commands**
```bash
# View keys
beeline keys list                     # Show all keys in vault

# Manual key import (advanced users)
beeline keys import alice posting     # Import specific key role
beeline keys import alice active --no-pin  # Import without PIN

# Key management
beeline keys remove alice posting     # Remove specific key
beeline keys set-default alice        # Set default account
```

#### **Balance Commands**
```bash
# Live balance checking
beeline balance                       # Default account
beeline balance alice                 # Specific account
beeline balance @alice                # @ prefix accepted
beeline balance alice --format json  # JSON output
beeline balance alice --node custom  # Custom RPC node

# Safe testing
beeline balance alice --mock         # Mock data (no network)
```

#### **Transfer Commands**
```bash
# Basic syntax: beeline transfer <to> <amount> <currency> [memo] [options]

# Minimal transfers
beeline transfer @alice 1 HIVE
beeline transfer @bob 5.000 HBD

# With memos
beeline transfer @alice 1 HIVE "Hello!"
beeline transfer @bob 5 HBD "Payment for services"

# Multi-account
beeline transfer @customer 100 HIVE "Order" --from @business
beeline transfer @friend 1 HIVE "Gift" --from @personal

# Options
beeline transfer @alice 1 HIVE --mock           # Safe testing
beeline transfer @alice 1 HIVE --confirm        # Skip confirmation
beeline transfer @alice 1 HIVE --node custom    # Custom node
```

#### **Power Operations**
```bash
# Power up HIVE to Hive Power
beeline powerup 10 HIVE                          # Power up to self
beeline powerup 5.000 HIVE @alice                # Power up to another account
beeline powerup 100 HIVE @alice --from @business # Power up from specific account

# Power down Hive Power to liquid HIVE (13 weeks)
beeline powerdown 10 HP                          # Power down in HP units
beeline powerdown 5000 VESTS                     # Power down in VESTS units
beeline powerdown 50 HP --from @alice            # Power down from specific account

# Safe testing for power operations
beeline powerup 10 HIVE --mock                   # Test power up safely
beeline powerdown 10 HP --mock                   # Test power down safely
```

#### **Power Operation Commands**
```bash
# Power up (convert HIVE to Hive Power)
beeline powerup 10 HIVE                          # Power up to self
beeline powerup 5.000 HIVE @alice                # Power up to another account  
beeline powerup 100 HIVE @alice --from @business # Power up from specific account
beeline powerup 10 HIVE --mock                   # Test power up safely
beeline powerup 10 HIVE --confirm                # Skip confirmation prompt

# Power down (convert Hive Power to liquid HIVE over 13 weeks)
beeline powerdown 10 HP                          # Power down 10 Hive Power
beeline powerdown 5000 VESTS                     # Power down 5000 vesting shares
beeline powerdown 50 HP --from @alice            # Power down from specific account
beeline powerdown 10 HP --mock                   # Test power down safely
beeline powerdown 10 HP --confirm                # Skip confirmation prompt
```

#### **Savings Operations (20% APR on HBD)**
```bash
# Deposit to savings (instant)
beeline deposit 100 HBD                          # Deposit HBD for 20% APR
beeline deposit 50 HIVE @alice                   # Deposit to another account
beeline deposit 1000 HBD --from @business        # Deposit from specific account

# Withdraw from savings (3-day processing)
beeline withdraw 100 HBD                         # Withdraw from savings
beeline withdraw 50 HIVE @alice                  # Withdraw to specific account
beeline withdraw 200 HBD --from @business        # Withdraw from specific account

# Safe testing for savings operations
beeline deposit 100 HBD --mock                   # Test deposit safely
beeline withdraw 50 HBD --mock                   # Test withdrawal safely
```

#### **Reward Management**
```bash
# Check available rewards
beeline claim --show-only                        # Show pending rewards
beeline claim alice --show-only                  # Check specific account

# Claim all rewards (HIVE, HBD, VESTS)
beeline claim                                    # Claim all rewards for default account
beeline claim alice                              # Claim rewards for specific account
beeline claim alice --all                        # Claim all without confirmation

# Safe testing
beeline claim --mock                             # Test reward claiming safely
```

#### **Resource Credits (RC) Monitoring**
```bash
# Check RC status
beeline rc                                       # Check default account RC
beeline rc alice                                 # Check specific account RC
beeline rc alice --format json                   # JSON output format

# Continuous monitoring
beeline rc alice --watch                         # Watch RC levels live
beeline rc alice --threshold 30                  # Custom warning threshold

# Transaction capacity estimates included automatically
```

#### **Information Commands**
```bash
beeline version                       # Version and system info
beeline --help                       # Main help
beeline <command> --help             # Command-specific help
```

## 🔐 Security Features

### PIN Protection

When you login or import keys, you can set a PIN for additional encryption:

```bash
beeline login alice  # Will prompt for PIN (recommended)
beeline login alice --no-pin  # Skip PIN, use OS keychain only
```

Your keys are stored with multiple layers of security:
- **PIN Encryption** - AES-256 encryption with your chosen PIN
- **OS Keychain** - Secure storage using your system's keychain
- **Memory Scrubbing** - Keys are wiped from memory after use

### Multiple Security Levels

1. **Maximum Security** (PIN + OS Keychain)
   ```bash
   beeline login alice  # Default mode
   ```

2. **Standard Security** (OS Keychain only)
   ```bash
   beeline login alice --no-pin
   ```

3. **Mock Mode** (No real keys required)
   ```bash
   beeline balance alice --mock
   beeline transfer @bob 1 HIVE --mock
   ```

## 👥 Multi-Account Workflow

Beeline is designed for users with multiple Hive accounts:

### **Setting Up Multiple Accounts**
```bash
# Add your main account (shows welcome sequence)
beeline login alice

# Add your alt account
beeline login alice-alt

# Add your business account  
beeline login mycompany

# Add content creator account
beeline login alice-creator
```

### **Managing Multiple Accounts**
```bash
# View all accounts
beeline accounts list

# View specific account details
beeline accounts info alice
beeline accounts info mycompany

# Switch default account
beeline accounts switch alice-alt

# Check which account is default
beeline accounts list  # Shows (default) indicator
```

### **Multi-Account Operations**
```bash
# Use default account
beeline balance                    # Uses current default
beeline transfer @friend 5 HIVE   # From default account

# Use specific account
beeline balance mycompany
beeline transfer @customer 100 HIVE "Invoice #123" --from mycompany
beeline transfer @collaborator 25 HBD "Project payment" --from alice-creator

# Switch and operate
beeline accounts switch mycompany
beeline balance                    # Now shows mycompany balance
beeline transfer @supplier 500 HIVE "Bulk order"
```

### **Multi-Account Use Cases**
```bash
# Personal vs Business separation
beeline login alice                # Personal account
beeline login alice-business       # Business account
beeline transfer @friend 5 HIVE "Dinner" --from alice
beeline transfer @vendor 200 HIVE "Services" --from alice-business

# Content creator workflow
beeline login creator              # Main creator account
beeline login creator-tips         # Tips and donations account
beeline transfer @collaborator 50 HIVE "Video editing" --from creator
beeline balance creator-tips       # Check tip earnings

# Testing and development
beeline login testaccount          # Test account
beeline transfer @anyone 0.001 HIVE "API test" --from testaccount --mock
```

## 🎨 Cyberpunk Features

### Visual Style

- **Neon Colors** - Cyan, magenta, electric green with gradients
- **ASCII Art** - Epic banners and grid patterns
- **Animated Effects** - Spinning loaders and progress indicators
- **Styled Output** - Color-coded roles, status indicators, and boxes

### Command Styling

Every command features cyberpunk aesthetics:
- 🔹 Account names with `@` prefix
- 🔸 Color-coded key roles (posting, active, memo, owner)
- ⚡ Animated spinners during blockchain operations
- 📦 Boxed output with neon borders
- 🎯 Status indicators and progress feedback

## 🛠️ Advanced Usage

### Key Roles Explained

- **📝 posting** - Social interactions (posts, votes, follows)
- **⚡ active** - Financial operations (transfers, power up/down)
- **💬 memo** - Private encrypted messages
- **👑 owner** - Account control (recovery, key changes) - **Use with extreme caution**

### Import Strategies

1. **Password Login** (Recommended)
   ```bash
   beeline login alice --roles posting,active,memo
   ```
   Automatically derives all keys from your master password

2. **Individual Key Import** (Advanced)
   ```bash
   beeline keys import alice posting  # Import one key at a time
   beeline keys import alice active
   ```
   For users who prefer manual key management

### Mock Mode for Testing

Test all operations safely before using real blockchain:

```bash
# Test balance checking
beeline balance alice --mock
beeline balance nonexistent --mock        # Works even for fake accounts

# Test transfers without broadcasting
beeline transfer @bob 10 HIVE "test" --mock
beeline transfer @alice 999 HIVE "big test" --mock --confirm
beeline transfer @anyone 5 HBD "safe test" --from @fakeaccount --mock

# Test power operations safely
beeline powerup 100 HIVE --mock           # Test power up
beeline powerdown 50 HP --mock            # Test power down

# Test savings operations safely  
beeline deposit 1000 HBD --mock           # Test savings deposit
beeline withdraw 500 HIVE --mock          # Test savings withdrawal

# Test reward claiming safely
beeline claim --mock                      # Test reward claiming

# Test RC monitoring (read-only operations)
beeline rc alice                          # Always safe - just reads data
beeline rc alice --format json           # JSON output

# Test account management (always safe)
beeline accounts list                      # No blockchain calls
beeline keys list                         # Local vault only

# Test all commands safely
beeline login testaccount --mock          # Will show error but safe
beeline transfer @test 1 HIVE --mock      # Always works
```

### **Recommended Testing Workflow**
```bash
# 1. Start with mock mode to learn commands
beeline balance alice --mock
beeline transfer @bob 1 HIVE "learning" --mock
beeline powerup 10 HIVE --mock             # Learn power operations
beeline deposit 100 HBD --mock             # Learn savings operations
beeline claim --mock                       # Learn reward claiming

# 2. Test account management (always safe)
beeline accounts list
beeline keys list  

# 3. Only then proceed to real operations with small amounts
beeline login testaccount                  # Use test account first!
beeline balance testaccount               # Real blockchain check
beeline transfer @friend 0.001 HIVE "real test"  # Tiny real transfer

# 4. Scale up to normal operations
beeline login mainaccount
beeline balance
beeline transfer @recipient 10 HIVE "real payment"
```

## 🔧 Development

### Building from Source

```bash
git clone https://github.com/yourusername/beeline
cd beeline
npm install
npm run build
./bin/run --help
```

### Development Commands

```bash
npm run dev      # Run with ts-node
npm run build    # Compile TypeScript
npm run lint     # Code linting
npm test         # Run tests
```

## 🚨 Security Notes

### ⚠️ Important Security Practices

1. **Never share your private keys or master password**
2. **Use PIN encryption for additional security**
3. **Test with mock mode before live operations**
4. **Keep your master password secure and backed up**
5. **Be cautious with owner keys** - they control your entire account

### 🔒 What Beeline Stores

- **Encrypted private keys** in your OS keychain
- **Public keys and account metadata** in local config
- **NO passwords or sensitive data** in plain text

### 🛡️ What Beeline Doesn't Store

- Your master password (memory is scrubbed immediately)
- Unencrypted private keys
- Transaction history (fetched fresh from blockchain)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🌟 Acknowledgments

- Built with [OCLIF](https://oclif.io/) framework
- Powered by [DHive](https://gitlab.syncad.com/hive/dhive) for Hive blockchain connectivity
- Styled with [Chalk](https://github.com/chalk/chalk) and friends for terminal colors

---

**Welcome to the neon grid, runner. Type, sign, rule the chain.**

Find me on Hive [@beggars](https://hive.blog/@beggars)