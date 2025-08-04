// Comprehensive HiveEngine Plugin for Beeline Wallet
// Provides full integration with HiveEngine sidechain

const plugin = {
  name: 'hiveengine-plugin',
  description: 'Complete HiveEngine sidechain integration - tokens, NFTs, DeFi operations',
  version: '1.0.0',
  
  activate(context) {
    const API_BASE = 'https://enginerpc.com';
    
    // Helper function to make RPC calls with proper error handling
    async function rpcCall(endpoint, method, params, retries = 3) {
      const payload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      };
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Beeline-Wallet/1.0'
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data.error) {
            throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
          }
          
          return data.result;
          
        } catch (error) {
          if (attempt === retries) {
            throw error;
          }
          context.log(`Attempt ${attempt}/${retries} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // Get account info with clean name handling
    function getCleanAccount(account) {
      if (!account) return null;
      return account.startsWith('@') ? account.substring(1) : account;
    }
    
    // Format numbers for display
    function formatNumber(num, decimals = 3) {
      const n = parseFloat(num || 0);
      return n.toFixed(decimals);
    }
    
    // Helper function to create HiveEngine transaction
    async function createHiveEngineTransaction(account, contractName, contractAction, contractPayload) {
      try {
        // Use the plugin context's wallet functionality for blockchain operations
        const payload = {
          contractName,
          contractAction,
          contractPayload
        };
        
        // HiveEngine transactions require active authority and use the ssc-mainnet-hive ID
        const result = await context.wallet.broadcastCustomJson(
          account,
          'ssc-mainnet-hive',
          payload,
          [account], // required_auths (active key required)
          [] // required_posting_auths
        );
        
        return result;
        
      } catch (error) {
        // Provide more helpful error messages
        if (error.message.includes('Non-base58 character')) {
          throw new Error(`No active key found for @${account}. Please import your active key first with: beeline keys import ${account} active`);
        } else if (error.message.includes('Invalid PIN')) {
          throw new Error(`Invalid PIN for @${account}. Please check your PIN and try again.`);
        } else if (error.message.includes('No active key found')) {
          throw new Error(`Active key required for @${account}. Please import your active key first with: beeline keys import ${account} active`);
        } else if (error.message.includes('insufficient funds')) {
          throw new Error(`Insufficient BEE or ENG tokens for token creation. You need ~100 BEE + 1 ENG tokens.`);
        } else {
          throw new Error(`Transaction failed: ${error.message}`);
        }
      }
    }
    
    // Validate token amount and format
    function validateTokenAmount(amount, precision = 3) {
      const num = parseFloat(amount);
      if (isNaN(num) || num <= 0) {
        throw new Error('Amount must be a positive number');
      }
      return num.toFixed(precision);
    }
    
    // COMMAND: Token Balances
    context.addCommand('he-tokens', 'Show HiveEngine token balances', async (args, flags) => {
      try {
        const account = getCleanAccount(args[0] || await context.wallet.getCurrentAccount());
        
        if (!account) {
          context.error('No account specified and no current account set');
          return;
        }
        
        context.log(`💎 Fetching HiveEngine tokens for @${account}...`);
        
        const balances = await rpcCall('/contracts', 'find', {
          contract: 'tokens',
          table: 'balances',
          query: { account },
          limit: 1000,
          indexes: [{ index: '_id', descending: false }]
        });
        
        if (!balances || balances.length === 0) {
          context.log(`No HiveEngine tokens found for @${account}`);
          return;
        }
        
        // Filter non-zero balances
        const activeBalances = balances.filter(token => 
          parseFloat(token.balance || 0) > 0 || 
          parseFloat(token.stake || 0) > 0 ||
          parseFloat(token.pendingUnstake || 0) > 0
        );
        
        if (activeBalances.length === 0) {
          context.log(`@${account} has no active token balances`);
          return;
        }
        
        context.success(`\n🔮 HIVE ENGINE TOKENS - @${account.toUpperCase()}\n`);
        
        for (const token of activeBalances) {
          const balance = parseFloat(token.balance || 0);
          const stake = parseFloat(token.stake || 0);
          const pendingUnstake = parseFloat(token.pendingUnstake || 0);
          
          if (balance > 0) {
            context.success(`⚡ ${token.symbol.padEnd(12)} ${formatNumber(balance, 8).padStart(15)}`);
          }
          
          if (stake > 0) {
            context.success(`  📍 Staked      ${formatNumber(stake, 8).padStart(15)}`);
          }
          
          if (pendingUnstake > 0) {
            context.success(`  ⏳ Unstaking   ${formatNumber(pendingUnstake, 8).padStart(15)}`);
          }
        }
        
        context.success(`\n💫 Total: ${activeBalances.length} tokens with balances\n`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to fetch tokens: ${error.message}`);
      }
    });
    
    // COMMAND: Token Info
    context.addCommand('he-info', 'Get detailed token information', async (args, flags) => {
      try {
        const symbol = args[0];
        if (!symbol) {
          context.error('Usage: he-info <TOKEN_SYMBOL>');
          return;
        }
        
        context.log(`🔍 Getting info for ${symbol.toUpperCase()}...`);
        
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol: symbol.toUpperCase() }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol.toUpperCase()} not found`);
          return;
        }
        
        context.success(`\n📊 ${tokenInfo.symbol} TOKEN INFO\n`);
        context.success(`Name:           ${tokenInfo.name}`);
        context.success(`Symbol:         ${tokenInfo.symbol}`);
        context.success(`Precision:      ${tokenInfo.precision} decimals`);
        context.success(`Max Supply:     ${formatNumber(tokenInfo.maxSupply)} ${tokenInfo.symbol}`);
        context.success(`Circulating:    ${formatNumber(tokenInfo.circulatingSupply)} ${tokenInfo.symbol}`);
        context.success(`Issuer:         @${tokenInfo.issuer}`);
        
        if (tokenInfo.stakingEnabled) {
          context.success(`\n🥩 STAKING ENABLED`);
          context.success(`Unstaking Cool: ${tokenInfo.unstakingCooldown} days`);
        }
        
        if (tokenInfo.url) {
          context.success(`\nWebsite:        ${tokenInfo.url}`);
        }
        
        context.log('');
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to get token info: ${error.message}`);
      }
    });
    
    // COMMAND: Market Data
    context.addCommand('he-market', 'Show token market data and prices', async (args, flags) => {
      try {
        const symbol = args[0];
        if (!symbol) {
          context.error('Usage: he-market <TOKEN_SYMBOL>');
          return;
        }
        
        context.log(`📈 Getting market data for ${symbol.toUpperCase()}...`);
        
        // Get market info
        const marketData = await rpcCall('/contracts', 'findOne', {
          contract: 'market',
          table: 'metrics',
          query: { symbol: symbol.toUpperCase() }
        });
        
        if (!marketData) {
          context.error(`No market data found for ${symbol.toUpperCase()}`);
          return;
        }
        
        context.success(`\n💹 ${symbol.toUpperCase()} MARKET DATA\n`);
        context.success(`Last Price:     ${formatNumber(marketData.lastPrice, 8)} SWAP.HIVE`);
        context.success(`24h Volume:     ${formatNumber(marketData.volume)} ${symbol.toUpperCase()}`);
        context.success(`24h High:       ${formatNumber(marketData.highestBid, 8)} SWAP.HIVE`);
        context.success(`24h Low:        ${formatNumber(marketData.lowestAsk, 8)} SWAP.HIVE`);
        context.success(`Price Change:   ${marketData.priceChangePercent ? formatNumber(marketData.priceChangePercent, 2) + '%' : 'N/A'}`);
        context.log('');
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to get market data: ${error.message}`);
      }
    });
    
    // COMMAND: Top Tokens
    context.addCommand('he-top', 'Show top HiveEngine tokens by market cap', async (args, flags) => {
      try {
        const limit = parseInt(args[0]) || 10;
        context.log(`📊 Fetching top ${limit} HiveEngine tokens...`);
        
        const metrics = await rpcCall('/contracts', 'find', {
          contract: 'market',
          table: 'metrics',
          query: {},
          limit,
          indexes: [{ index: 'volumeExpiration', descending: true }]
        });
        
        if (!metrics || metrics.length === 0) {
          context.error('No market data available');
          return;
        }
        
        context.success(`\n🏆 TOP ${limit} HIVEENGINE TOKENS\n`);
        context.log('RANK  SYMBOL       PRICE         24H VOL       CHANGE');
        context.log('────  ──────────   ───────────   ───────────   ──────');
        
        metrics.forEach((token, index) => {
          const rank = (index + 1).toString().padStart(2);
          const symbol = token.symbol.padEnd(10);
          const price = formatNumber(token.lastPrice, 8).padStart(11);
          const volume = formatNumber(token.volume, 0).padStart(11);
          const change = token.priceChangePercent ? 
            (parseFloat(token.priceChangePercent) >= 0 ? '+' : '') + formatNumber(token.priceChangePercent, 2) + '%' : 
            'N/A';
          
          context.success(`${rank}.   ${symbol}   ${price}   ${volume}   ${change}`);
        });
        
        context.log('');
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to get top tokens: ${error.message}`);
      }
    });
    
    // COMMAND: NFT Balances
    context.addCommand('he-nfts', 'Show HiveEngine NFT collections and tokens', async (args, flags) => {
      try {
        const account = getCleanAccount(args[0] || await context.wallet.getCurrentAccount());
        
        if (!account) {
          context.error('No account specified and no current account set');
          return;
        }
        
        context.log(`🖼️  Fetching NFTs for @${account}...`);
        
        const nfts = await rpcCall('/contracts', 'find', {
          contract: 'nft',
          table: 'instances',
          query: { account },
          limit: 100,
          indexes: [{ index: '_id', descending: false }]
        });
        
        if (!nfts || nfts.length === 0) {
          context.success(`No NFTs found for @${account}`);
          
          // Force process exit to prevent hanging
          setTimeout(() => {
            process.exit(0);
          }, 50);
          return;
        }
        
        // Group by symbol
        const collections = {};
        nfts.forEach(nft => {
          if (!collections[nft.symbol]) {
            collections[nft.symbol] = [];
          }
          collections[nft.symbol].push(nft);
        });
        
        context.success(`\n🎨 NFT COLLECTIONS - @${account.toUpperCase()}\n`);
        
        for (const [symbol, tokens] of Object.entries(collections)) {
          context.success(`📚 ${symbol} Collection: ${tokens.length} tokens`);
          
          tokens.slice(0, 5).forEach(token => {
            const properties = token.properties ? Object.keys(token.properties).length : 0;
            context.success(`  🎭 ID #${token._id} (${properties} properties)`);
          });
          
          if (tokens.length > 5) {
            context.success(`  ... and ${tokens.length - 5} more`);
          }
          context.log('');
        }
        
        context.success(`💎 Total: ${nfts.length} NFTs across ${Object.keys(collections).length} collections\n`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to fetch NFTs: ${error.message}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
      }
    });
    
    // COMMAND: Mining Pools
    context.addCommand('he-mining', 'Show mining pool information', async (args, flags) => {
      try {
        context.log('⛏️  Fetching mining pools...');
        
        const pools = await rpcCall('/contracts', 'find', {
          contract: 'mining',
          table: 'miningPools',
          query: {},
          limit: 50,
          indexes: [{ index: '_id', descending: false }]
        });
        
        if (!pools || pools.length === 0) {
          context.log('No mining pools found');
          return;
        }
        
        context.success(`\n⛏️  MINING POOLS\n`);
        
        pools.forEach(pool => {
          context.success(`💰 ${pool.symbol} Pool`);
          context.success(`  Token Power:    ${formatNumber(pool.tokenMiners)} miners`);
          context.success(`  NFT Power:      ${formatNumber(pool.nftTokenMiners)} NFT miners`);
          context.success(`  Total Power:    ${formatNumber(pool.totalPower)}`);
          context.success(`  Active:         ${pool.active ? '✅ Yes' : '❌ No'}`);
          context.log('');
        });
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to fetch mining pools: ${error.message}`);
      }
    });
    
    // COMMAND: API Test
    context.addCommand('he-test', 'Test HiveEngine API connectivity', async (args, flags) => {
      try {
        context.log('🔧 Testing HiveEngine API...');
        
        // Test basic connectivity
        const testResult = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { symbol: 'BEE', account: 'aggroed' }
        });
        
        if (testResult && testResult.balance) {
          context.success('✅ HiveEngine API is working!');
          context.log(`Test query result: @aggroed has ${testResult.balance} BEE tokens`);
        } else {
          context.error('❌ API responded but no expected data found');
        }
        
        // Test endpoints
        const endpoints = ['/contracts', '/blockchain'];
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'getStatus',
                id: 1
              })
            });
            
            context.success(`${endpoint}: ${response.ok ? '✅ OK' : '❌ Failed'} (${response.status})`);
          } catch (error) {
            context.success(`${endpoint}: ❌ Failed (${error.message})`);
          }
        }
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`API test failed: ${error.message}`);
      }
    });
    
    // COMMAND: Token Transfer
    context.addCommand('he-transfer', 'Transfer HiveEngine tokens', async (args, flags) => {
      try {
        if (args.length < 3) {
          context.error('Usage: he-transfer <to> <amount> <symbol> [memo] [--from account] [--mock]');
          context.log('Examples:');
          context.log('  beeline run-plugin he-transfer alice 10 BEE');
          context.log('  beeline run-plugin he-transfer alice 10 BEE "Payment for services"');
          context.log('  beeline run-plugin he-transfer alice 10 BEE --from myaccount');
          context.log('  beeline run-plugin he-transfer alice 10 BEE --mock  # Safe testing');
          return;
        }
        
        const to = getCleanAccount(args[0]);
        const amount = args[1];
        const symbol = args[2].toUpperCase();
        const memo = args[3] || '';
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!to) {
          context.error('Invalid recipient account');
          return;
        }
        
        if (!fromAccount) {
          context.error('No sender account specified and no current account set');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info to validate precision
        context.log(`🔍 Validating ${symbol} token...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Format amount with correct precision
        const precision = tokenInfo.precision || 3;
        const formattedAmount = parseFloat(amount).toFixed(precision);
        
        // Check sender balance
        context.log(`💰 Checking balance for @${fromAccount}...`);
        const senderBalance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol }
        });
        
        if (!senderBalance || parseFloat(senderBalance.balance || 0) < parseFloat(formattedAmount)) {
          context.error(`Insufficient ${symbol} balance. Available: ${senderBalance?.balance || '0'} ${symbol}`);
          return;
        }
        
        // Show transfer summary
        context.success(`\n💎 HIVEENGINE TOKEN TRANSFER\n`);
        context.log(`From:       @${fromAccount}`);
        context.log(`To:         @${to}`);
        context.log(`Amount:     ${formattedAmount} ${symbol}`);
        context.log(`Token:      ${tokenInfo.name} (${symbol})`);
        if (memo) {
          context.log(`Memo:       "${memo}"`);
        }
        context.log(`Available:  ${senderBalance.balance} ${symbol}`);
        context.log('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Transfer validated but not executed');
          context.log('Remove --mock flag to execute the real transfer');
          return;
        }
        
        // Confirmation prompt (simplified for plugin)
        context.log('⚠️  This will execute a real blockchain transaction!');
        context.log('Make sure all details are correct before proceeding.');
        context.log('');
        
        // Execute the transfer
        context.log('📡 Broadcasting HiveEngine transfer...');
        
        const contractPayload = {
          symbol,
          to,
          quantity: formattedAmount
        };
        
        if (memo) {
          contractPayload.memo = memo;
        }
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'tokens',
          'transfer',
          contractPayload
        );
        
        context.success('✅ Transfer completed successfully!');
        context.log(`Transaction ID: ${result.id}`);
        if (result.block_num) {
          context.log(`Block: ${result.block_num}`);
        } else {
          context.log(`Block: Processing...`);
        }
        context.log('');
        context.log('🔍 You can verify the transaction at:');
        context.log(`   https://hiveblocks.com/tx/${result.id}`);
        context.log(`   https://he.dtools.dev/tx/${result.id}`);
        
      } catch (error) {
        context.error(`Transfer failed: ${error.message}`);
      }
    });
    
    // COMMAND: Stake Tokens
    context.addCommand('he-stake', 'Stake HiveEngine tokens', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: he-stake <amount> <symbol> [--from account] [--mock]');
          context.log('Examples:');
          context.log('  beeline run-plugin he-stake 10 BEE');
          context.log('  beeline run-plugin he-stake 100 LEO --from myaccount');
          context.log('  beeline run-plugin he-stake 50 PAL --mock  # Safe testing');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.log(`🔍 Validating ${symbol} token staking...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        if (!tokenInfo.stakingEnabled) {
          context.error(`Staking is not enabled for ${symbol}`);
          return;
        }
        
        // Format amount with correct precision
        const precision = tokenInfo.precision || 3;
        const formattedAmount = parseFloat(amount).toFixed(precision);
        
        // Check balance
        const balance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol }
        });
        
        if (!balance || parseFloat(balance.balance || 0) < parseFloat(formattedAmount)) {
          context.error(`Insufficient ${symbol} balance. Available: ${balance?.balance || '0'} ${symbol}`);
          return;
        }
        
        // Show staking summary
        context.success(`\n🥩 HIVEENGINE TOKEN STAKING\n`);
        context.log(`Account:    @${fromAccount}`);
        context.log(`Amount:     ${formattedAmount} ${symbol}`);
        context.log(`Token:      ${tokenInfo.name} (${symbol})`);
        context.log(`Available:  ${balance.balance} ${symbol}`);
        context.log(`Cooldown:   ${tokenInfo.unstakingCooldown} days`);
        context.log('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Staking validated but not executed');
          return;
        }
        
        context.log('📡 Broadcasting HiveEngine stake...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'tokens',
          'stake',
          {
            to: fromAccount,
            symbol,
            quantity: formattedAmount
          }
        );
        
        context.success('✅ Staking completed successfully!');
        context.log(`Transaction ID: ${result.id}`);
        if (result.block_num) {
          context.log(`Block: ${result.block_num}`);
        } else {
          context.log(`Block: Processing...`);
        }
        
      } catch (error) {
        context.error(`Staking failed: ${error.message}`);
      }
    });
    
    // COMMAND: Unstake Tokens
    context.addCommand('he-unstake', 'Unstake HiveEngine tokens', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: he-unstake <amount> <symbol> [--from account] [--mock]');
          context.log('Examples:');
          context.log('  beeline run-plugin he-unstake 10 BEE');
          context.log('  beeline run-plugin he-unstake 100 LEO --from myaccount');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Format amount with correct precision
        const precision = tokenInfo.precision || 3;
        const formattedAmount = parseFloat(amount).toFixed(precision);
        
        // Check staked balance
        const balance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol }
        });
        
        if (!balance || parseFloat(balance.stake || 0) < parseFloat(formattedAmount)) {
          context.error(`Insufficient staked ${symbol}. Available: ${balance?.stake || '0'} ${symbol}`);
          return;
        }
        
        // Show unstaking summary
        context.success(`\n⏳ HIVEENGINE TOKEN UNSTAKING\n`);
        context.log(`Account:     @${fromAccount}`);
        context.log(`Amount:      ${formattedAmount} ${symbol}`);
        context.log(`Token:       ${tokenInfo.name} (${symbol})`);
        context.log(`Staked:      ${balance.stake} ${symbol}`);
        context.log(`Cooldown:    ${tokenInfo.unstakingCooldown} days`);
        context.log('');
        context.log('⚠️  Unstaking has a cooldown period before tokens become liquid');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Unstaking validated but not executed');
          return;
        }
        
        context.log('📡 Broadcasting HiveEngine unstake...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'tokens',
          'unstake',
          {
            symbol,
            quantity: formattedAmount
          }
        );
        
        context.success('✅ Unstaking started successfully!');
        context.log(`Transaction ID: ${result.id}`);
        context.log(`Tokens will be available after ${tokenInfo.unstakingCooldown} days`);
        
      } catch (error) {
        context.error(`Unstaking failed: ${error.message}`);
      }
    });
    
    // COMMAND: Delegate Staked Tokens
    context.addCommand('he-delegate', 'Delegate staked tokens to another account', async (args, flags) => {
      try {
        if (args.length < 3) {
          context.error('Usage: he-delegate <amount> <symbol> <to> [--from account] [--mock]');
          context.success('Examples:');
          context.success('  beeline run-plugin he-delegate 100 LEO alice     # Delegate 100 staked LEO to @alice');
          context.success('  beeline run-plugin he-delegate 50 BEE bob --mock');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const toAccount = getCleanAccount(args[2]);
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        if (!toAccount) {
          context.error('Invalid recipient account');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info to validate staking enabled
        context.success(`🔍 Validating ${symbol} token for delegation...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        if (!tokenInfo.stakingEnabled) {
          context.error(`Token ${symbol} does not support staking/delegation`);
          return;
        }
        
        // Check available staked balance
        const stake = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol }
        });
        
        const availableStake = parseFloat(stake?.stake || 0) - parseFloat(stake?.delegationsOut || 0);
        if (availableStake < parseFloat(validatedAmount)) {
          context.error(`Insufficient available staked ${symbol}. Available: ${availableStake.toFixed(tokenInfo.precision || 3)} ${symbol}`);
          return;
        }
        
        // Show delegation summary
        context.success(`\n🤝 HIVEENGINE TOKEN DELEGATION\n`);
        context.success(`From:        @${fromAccount}`);
        context.success(`To:          @${toAccount}`);
        context.success(`Delegating:  ${validatedAmount} ${symbol} (staked)`);
        context.success(`Available:   ${availableStake.toFixed(tokenInfo.precision || 3)} ${symbol}`);
        context.success('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Delegation validated but not executed');
          return;
        }
        
        context.success('📡 Creating HiveEngine delegation...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'tokens',
          'delegate',
          {
            to: toAccount,
            symbol,
            quantity: validatedAmount
          }
        );
        
        context.success('✅ Token delegation successful!');
        context.success(`Transaction ID: ${result.id}`);
        context.success(`${validatedAmount} ${symbol} staked tokens delegated to @${toAccount}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Delegation failed: ${error.message}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
      }
    });
    
    // COMMAND: Undelegate Staked Tokens
    context.addCommand('he-undelegate', 'Begin undelegating tokens from another account', async (args, flags) => {
      try {
        if (args.length < 3) {
          context.error('Usage: he-undelegate <amount> <symbol> <from> [--account your_account] [--mock]');
          context.success('Examples:');
          context.success('  beeline run-plugin he-undelegate 100 LEO alice   # Undelegate 100 LEO from @alice');
          context.success('  beeline run-plugin he-undelegate 50 BEE bob --mock');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const fromAccount = getCleanAccount(args[2]);
        const yourAccount = getCleanAccount(flags.account || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!yourAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        if (!fromAccount) {
          context.error('Invalid delegatee account');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.success(`🔍 Validating ${symbol} token for undelegation...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        if (!tokenInfo.stakingEnabled) {
          context.error(`Token ${symbol} does not support staking/delegation`);
          return;
        }
        
        // Check delegation exists
        const delegation = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: yourAccount, symbol }
        });
        
        const delegatedAmount = parseFloat(delegation?.delegationsOut || 0);
        if (delegatedAmount < parseFloat(validatedAmount)) {
          context.error(`Insufficient delegated ${symbol}. Delegated: ${delegatedAmount.toFixed(tokenInfo.precision || 3)} ${symbol}`);
          return;
        }
        
        // Show undelegation summary
        context.success(`\n🔄 HIVEENGINE TOKEN UNDELEGATION\n`);
        context.success(`Your Account: @${yourAccount}`);
        context.success(`From:         @${fromAccount}`);
        context.success(`Undelegating: ${validatedAmount} ${symbol}`);
        context.success(`Cooldown:     ${tokenInfo.undelegationCooldown || tokenInfo.unstakingCooldown || 7} days`);
        context.success('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Undelegation validated but not executed');
          return;
        }
        
        context.success('📡 Creating HiveEngine undelegation...');
        
        const result = await createHiveEngineTransaction(
          yourAccount,
          'tokens',
          'undelegate',
          {
            from: fromAccount,
            symbol,
            quantity: validatedAmount
          }
        );
        
        context.success('✅ Token undelegation initiated!');
        context.success(`Transaction ID: ${result.id}`);
        context.success(`${validatedAmount} ${symbol} will return to your staked balance after cooldown period`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Undelegation failed: ${error.message}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
      }
    });
    
    // COMMAND: Market Sell Order
    context.addCommand('he-sell', 'Create a sell order on HiveEngine market', async (args, flags) => {
      try {
        if (args.length < 3) {
          context.error('Usage: he-sell <amount> <symbol> <price> [--from account] [--mock]');
          context.log('Examples:');
          context.log('  beeline run-plugin he-sell 100 LEO 1.5      # Sell 100 LEO at 1.5 SWAP.HIVE each');
          context.log('  beeline run-plugin he-sell 50 BEE 0.45 --mock');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const price = args[2];
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate amount and price
        let validatedAmount, validatedPrice;
        try {
          validatedAmount = validateTokenAmount(amount);
          validatedPrice = validateTokenAmount(price);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.log(`🔍 Validating ${symbol} token for market sale...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Format amounts with correct precision
        const tokenPrecision = tokenInfo.precision || 3;
        const pricePrecision = 8; // SWAP.HIVE has 8 decimals
        const formattedAmount = parseFloat(amount).toFixed(tokenPrecision);
        const formattedPrice = parseFloat(price).toFixed(pricePrecision);
        
        // Check balance
        const balance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol }
        });
        
        if (!balance || parseFloat(balance.balance || 0) < parseFloat(formattedAmount)) {
          context.error(`Insufficient ${symbol} balance. Available: ${balance?.balance || '0'} ${symbol}`);
          return;
        }
        
        // Calculate total value
        const totalValue = (parseFloat(formattedAmount) * parseFloat(formattedPrice)).toFixed(8);
        
        // Show sell order summary
        context.success(`\n📈 HIVEENGINE SELL ORDER\n`);
        context.log(`Account:     @${fromAccount}`);
        context.log(`Selling:     ${formattedAmount} ${symbol}`);
        context.log(`Price:       ${formattedPrice} SWAP.HIVE per ${symbol}`);
        context.log(`Total Value: ${totalValue} SWAP.HIVE`);
        context.log(`Available:   ${balance.balance} ${symbol}`);
        context.log('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Sell order validated but not created');
          return;
        }
        
        context.log('📡 Creating HiveEngine sell order...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'market',
          'sell',
          {
            symbol,
            quantity: formattedAmount,
            price: formattedPrice
          }
        );
        
        context.success('✅ Sell order created successfully!');
        context.log(`Transaction ID: ${result.id}`);
        context.log(`Your ${formattedAmount} ${symbol} tokens are now listed for sale at ${formattedPrice} SWAP.HIVE each`);
        
      } catch (error) {
        context.error(`Sell order failed: ${error.message}`);
      }
    });
    
    // COMMAND: Market Buy Order
    context.addCommand('he-buy', 'Create a buy order on HiveEngine market', async (args, flags) => {
      try {
        if (args.length < 3) {
          context.error('Usage: he-buy <amount> <symbol> <price> [--from account] [--mock]');
          context.log('Examples:');
          context.log('  beeline run-plugin he-buy 100 LEO 1.5      # Buy 100 LEO at 1.5 SWAP.HIVE each');
          context.log('  beeline run-plugin he-buy 50 BEE 0.45 --mock');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const price = args[2];
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate amount and price
        let validatedAmount, validatedPrice;
        try {
          validatedAmount = validateTokenAmount(amount);
          validatedPrice = validateTokenAmount(price);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.log(`🔍 Validating ${symbol} token for market purchase...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Format amounts with correct precision
        const tokenPrecision = tokenInfo.precision || 3;
        const pricePrecision = 8; // SWAP.HIVE has 8 decimals
        const formattedAmount = parseFloat(amount).toFixed(tokenPrecision);
        const formattedPrice = parseFloat(price).toFixed(pricePrecision);
        
        // Calculate total cost
        const totalCost = (parseFloat(formattedAmount) * parseFloat(formattedPrice)).toFixed(8);
        
        // Check SWAP.HIVE balance
        const hiveBalance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol: 'SWAP.HIVE' }
        });
        
        if (!hiveBalance || parseFloat(hiveBalance.balance || 0) < parseFloat(totalCost)) {
          context.error(`Insufficient SWAP.HIVE balance. Required: ${totalCost} SWAP.HIVE, Available: ${hiveBalance?.balance || '0'} SWAP.HIVE`);
          return;
        }
        
        // Show buy order summary
        context.success(`\n📉 HIVEENGINE BUY ORDER\n`);
        context.log(`Account:      @${fromAccount}`);
        context.log(`Buying:       ${formattedAmount} ${symbol}`);
        context.log(`Price:        ${formattedPrice} SWAP.HIVE per ${symbol}`);
        context.log(`Total Cost:   ${totalCost} SWAP.HIVE`);
        context.log(`Available:    ${hiveBalance.balance} SWAP.HIVE`);
        context.log('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Buy order validated but not created');
          return;
        }
        
        context.log('📡 Creating HiveEngine buy order...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'market',
          'buy',
          {
            symbol,
            quantity: formattedAmount,
            price: formattedPrice
          }
        );
        
        context.success('✅ Buy order created successfully!');
        context.log(`Transaction ID: ${result.id}`);
        context.log(`Your buy order for ${formattedAmount} ${symbol} at ${formattedPrice} SWAP.HIVE each is now active`);
        
      } catch (error) {
        context.error(`Buy order failed: ${error.message}`);
      }
    });
    
    // COMMAND: Market Buy (spend SWAP.HIVE, get tokens at current rate)
    context.addCommand('he-market-buy', 'Market buy tokens with SWAP.HIVE at current rate', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: he-market-buy <hive_amount> <symbol> [--from account] [--mock]');
          context.success('Examples:');
          context.success('  beeline run-plugin he-market-buy 10 LEO      # Spend 10 SWAP.HIVE, get LEO tokens');
          context.success('  beeline run-plugin he-market-buy 5.5 BEE --mock');
          return;
        }
        
        const hiveAmount = args[0];
        const symbol = args[1].toUpperCase();
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(hiveAmount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.success(`🔍 Validating ${symbol} token for market buy...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Check SWAP.HIVE balance
        const hiveBalance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol: 'SWAP.HIVE' }
        });
        
        if (!hiveBalance || parseFloat(hiveBalance.balance || 0) < parseFloat(validatedAmount)) {
          context.error(`Insufficient SWAP.HIVE balance. Available: ${hiveBalance?.balance || '0'} SWAP.HIVE`);
          return;
        }
        
        // Get current market data to estimate tokens received
        const buyOrders = await rpcCall('/contracts', 'find', {
          contract: 'market',
          table: 'sellBook',
          query: { symbol },
          limit: 10,
          indexes: [{ index: 'price', descending: false }]
        });
        
        let estimatedTokens = 0;
        let remainingHive = parseFloat(validatedAmount);
        
        if (buyOrders && buyOrders.length > 0) {
          for (const order of buyOrders) {
            const orderPrice = parseFloat(order.price);
            const orderQuantity = parseFloat(order.quantity);
            const orderValue = orderPrice * orderQuantity;
            
            if (remainingHive <= 0) break;
            
            if (remainingHive >= orderValue) {
              estimatedTokens += orderQuantity;
              remainingHive -= orderValue;
            } else {
              estimatedTokens += remainingHive / orderPrice;
              remainingHive = 0;
            }
          }
        }
        
        // Show market buy summary
        context.success(`\n💸 HIVEENGINE MARKET BUY\n`);
        context.success(`Account:          @${fromAccount}`);
        context.success(`Spending:         ${validatedAmount} SWAP.HIVE`);
        context.success(`Token:            ${symbol}`);
        context.success(`Estimated tokens: ~${estimatedTokens.toFixed(tokenInfo.precision || 3)} ${symbol}`);
        context.success(`Available HIVE:   ${hiveBalance.balance} SWAP.HIVE`);
        context.success('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Market buy validated but not executed');
          return;
        }
        
        context.success('📡 Executing HiveEngine market buy...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'market',
          'marketBuy',
          {
            symbol,
            quantity: validatedAmount
          }
        );
        
        context.success('✅ Market buy executed successfully!');
        context.success(`Transaction ID: ${result.id}`);
        context.success(`Spent ${validatedAmount} SWAP.HIVE to buy ${symbol} tokens at current market rate`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Market buy failed: ${error.message}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
      }
    });
    
    // COMMAND: Market Sell (sell tokens at current rate)
    context.addCommand('he-market-sell', 'Market sell tokens at current rate for SWAP.HIVE', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: he-market-sell <amount> <symbol> [--from account] [--mock]');
          context.success('Examples:');
          context.success('  beeline run-plugin he-market-sell 100 LEO    # Sell 100 LEO at current rate');
          context.success('  beeline run-plugin he-market-sell 50 BEE --mock');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.success(`🔍 Validating ${symbol} token for market sell...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Check token balance
        const balance = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'balances',
          query: { account: fromAccount, symbol }
        });
        
        if (!balance || parseFloat(balance.balance || 0) < parseFloat(validatedAmount)) {
          context.error(`Insufficient ${symbol} balance. Available: ${balance?.balance || '0'} ${symbol}`);
          return;
        }
        
        // Get current market data to estimate HIVE received
        const sellOrders = await rpcCall('/contracts', 'find', {
          contract: 'market',
          table: 'buyBook',
          query: { symbol },
          limit: 10,
          indexes: [{ index: 'price', descending: true }]
        });
        
        let estimatedHive = 0;
        let remainingTokens = parseFloat(validatedAmount);
        
        if (sellOrders && sellOrders.length > 0) {
          for (const order of sellOrders) {
            const orderPrice = parseFloat(order.price);
            const orderQuantity = parseFloat(order.quantity);
            
            if (remainingTokens <= 0) break;
            
            if (remainingTokens >= orderQuantity) {
              estimatedHive += orderPrice * orderQuantity;
              remainingTokens -= orderQuantity;
            } else {
              estimatedHive += orderPrice * remainingTokens;
              remainingTokens = 0;
            }
          }
        }
        
        // Show market sell summary
        context.success(`\n💰 HIVEENGINE MARKET SELL\n`);
        context.success(`Account:          @${fromAccount}`);
        context.success(`Selling:          ${validatedAmount} ${symbol}`);
        context.success(`Estimated HIVE:   ~${estimatedHive.toFixed(8)} SWAP.HIVE`);
        context.success(`Available:        ${balance.balance} ${symbol}`);
        context.success('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Market sell validated but not executed');
          return;
        }
        
        context.success('📡 Executing HiveEngine market sell...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'market',
          'marketSell',
          {
            symbol,
            quantity: validatedAmount
          }
        );
        
        context.success('✅ Market sell executed successfully!');
        context.success(`Transaction ID: ${result.id}`);
        context.success(`Sold ${validatedAmount} ${symbol} at current market rate for SWAP.HIVE`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Market sell failed: ${error.message}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
      }
    });
    
    // COMMAND: Cancel Order
    context.addCommand('he-cancel', 'Cancel a buy or sell order', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: he-cancel <type> <order_id> [--from account] [--mock]');
          context.success('Examples:');
          context.success('  beeline run-plugin he-cancel buy 64a5f2b1c8d9e0f1234567890    # Cancel buy order');
          context.success('  beeline run-plugin he-cancel sell 64a5f2b1c8d9e0f1234567891   # Cancel sell order');
          return;
        }
        
        const orderType = args[0].toLowerCase();
        const orderId = args[1];
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        if (!['buy', 'sell'].includes(orderType)) {
          context.error('Order type must be "buy" or "sell"');
          return;
        }
        
        // Validate order ID format (basic check)
        if (!orderId || orderId.length < 10) {
          context.error('Invalid order ID format');
          return;
        }
        
        // Try to find the order to show details
        const tableName = orderType === 'buy' ? 'buyBook' : 'sellBook';
        const order = await rpcCall('/contracts', 'findOne', {
          contract: 'market',
          table: tableName,
          query: { _id: orderId, account: fromAccount }
        });
        
        // Show cancel summary
        context.success(`\n❌ CANCEL HIVEENGINE ORDER\n`);
        context.success(`Account:    @${fromAccount}`);
        context.success(`Order Type: ${orderType.toUpperCase()}`);
        context.success(`Order ID:   ${orderId}`);
        
        if (order) {
          context.success(`Symbol:     ${order.symbol}`);
          context.success(`Quantity:   ${order.quantity} ${order.symbol}`);
          context.success(`Price:      ${order.price} SWAP.HIVE`);
          context.success(`Total:      ${(parseFloat(order.quantity) * parseFloat(order.price)).toFixed(8)} SWAP.HIVE`);
        } else {
          context.success('Order:      Not found or not owned by your account');
        }
        context.success('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Order cancellation validated but not executed');
          return;
        }
        
        context.success('📡 Cancelling HiveEngine order...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'market',
          'cancel',
          {
            type: orderType,
            id: orderId
          }
        );
        
        context.success('✅ Order cancelled successfully!');
        context.success(`Transaction ID: ${result.id}`);
        context.success(`Your ${orderType} order has been cancelled and funds returned`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Order cancellation failed: ${error.message}`);
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
      }
    });
    
    // COMMAND: Create Token
    context.addCommand('he-create', 'Create a new HiveEngine token', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: he-create <name> <symbol> [options] [--from account] [--mock]');
          context.log('');
          context.log('Required:');
          context.log('  <name>     Token name (max 50 chars, letters/numbers/spaces only)');
          context.log('  <symbol>   Token symbol (max 10 chars, UPPERCASE only)');
          context.log('');
          context.log('Optional flags:');
          context.log('  --precision <0-8>      Decimal places (default: 3)');
          context.log('  --max-supply <amount>  Maximum supply (default: unlimited)');
          context.log('  --url <website>        Project website (max 255 chars)');
          context.log('');
          context.log('Examples:');
          context.log('  beeline run-plugin he-create "My Awesome Token" MYTOKEN');
          context.log('  beeline run-plugin he-create "Gaming Token" GAME --precision 8 --max-supply 1000000');
          context.log('  beeline run-plugin he-create "Test Token" TEST --url "https://myproject.com" --mock');
          return;
        }
        
        const name = args[0];
        const symbol = args[1].toUpperCase();
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        // Parse optional parameters
        const precision = parseInt(flags.precision) || 3;
        const maxSupply = flags['max-supply'];
        const url = flags.url;
        
        if (!fromAccount) {
          context.error('No account specified and no current account set');
          return;
        }
        
        // Validate inputs
        if (name.length > 50) {
          context.error('Token name must be 50 characters or less');
          return;
        }
        
        if (!/^[a-zA-Z0-9\s]+$/.test(name)) {
          context.error('Token name can only contain letters, numbers, and spaces');
          return;
        }
        
        if (symbol.length > 10) {
          context.error('Token symbol must be 10 characters or less');
          return;
        }
        
        if (!/^[A-Z]+$/.test(symbol)) {
          context.error('Token symbol must be uppercase letters only');
          return;
        }
        
        if (precision < 0 || precision > 8) {
          context.error('Precision must be between 0 and 8');
          return;
        }
        
        if (maxSupply && (isNaN(parseFloat(maxSupply)) || parseFloat(maxSupply) < 1 || parseFloat(maxSupply) > 9007199254740991)) {
          context.error('Max supply must be between 1 and 9,007,199,254,740,991');
          return;
        }
        
        if (url && url.length > 255) {
          context.error('URL must be 255 characters or less');
          return;
        }
        
        // Check if symbol already exists
        context.log(`🔍 Checking if ${symbol} token already exists...`);
        try {
          const existingToken = await rpcCall('/contracts', 'findOne', {
            contract: 'tokens',
            table: 'tokens',
            query: { symbol }
          });
          
          if (existingToken) {
            context.error(`Token ${symbol} already exists! Please choose a different symbol.`);
            return;
          }
        } catch (error) {
          // If we can't check, continue but warn
          context.log('⚠️  Could not verify symbol uniqueness, proceeding...');
        }
        
        // Build payload
        const contractPayload = {
          name,
          symbol,
          precision
        };
        
        if (maxSupply) {
          contractPayload.maxSupply = maxSupply;
        }
        
        if (url) {
          contractPayload.url = url;
        }
        
        // Show token creation summary
        context.success(`\n🏭 HIVEENGINE TOKEN CREATION\n`);
        context.log(`Creator:     @${fromAccount}`);
        context.log(`Name:        ${name}`);
        context.log(`Symbol:      ${symbol}`);
        context.log(`Precision:   ${precision} decimal places`);
        context.log(`Max Supply:  ${maxSupply ? formatNumber(maxSupply, 0) + ' ' + symbol : 'Unlimited'}`);
        if (url) {
          context.log(`Website:     ${url}`);
        }
        context.log('');
        context.log('⚠️  Token creation requires a fee and uses your active key');
        context.log('⚠️  Make sure all details are correct - they cannot be changed later!');
        context.log('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Token creation validated but not executed');
          context.log('Remove --mock flag to create the actual token');
          context.log('');
          context.log('Payload preview:');
          context.log(JSON.stringify({
            contractName: 'tokens',
            contractAction: 'create',
            contractPayload
          }, null, 2));
          return;
        }
        
        context.log('📡 Creating HiveEngine token...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'tokens',
          'create',
          contractPayload
        );
        
        context.success('✅ Token created successfully!');
        context.log(`Transaction ID: ${result.id}`);
        
        // Handle different result structures and debug the actual structure
        if (result.block_num) {
          context.log(`Block: ${result.block_num}`);
        } else if (result.blockNum) {
          context.log(`Block: ${result.blockNum}`);
        } else if (result.block) {
          context.log(`Block: ${result.block}`);
        } else {
          // The block might not be available immediately for HiveEngine transactions
          // as they are processed asynchronously by the sidechain
          context.log(`Block: Will be processed in next Hive block`);
        }
        context.log('');
        context.log('🔍 You can verify the transaction at:');
        context.log(`   https://hiveblocks.com/tx/${result.id}`);
        context.log(`   https://he.dtools.dev/tx/${result.id}`);
        context.log('');
        context.log(`🎉 Your new token ${symbol} is now live on HiveEngine!`);
        context.log(`   You can start issuing tokens with: he-issue <amount> ${symbol} <to>`);
        
      } catch (error) {
        context.error(`Token creation failed: ${error.message}`);
      }
    });
    
    // COMMAND: Issue Tokens
    context.addCommand('he-issue', 'Issue tokens to an account (token creator only)', async (args, flags) => {
      try {
        if (args.length < 3) {
          context.error('Usage: he-issue <amount> <symbol> <to> [--from account] [--mock]');
          context.log('Examples:');
          context.log('  beeline run-plugin he-issue 1000 MYTOKEN alice');
          context.log('  beeline run-plugin he-issue 500 GAME bob --mock');
          return;
        }
        
        const amount = args[0];
        const symbol = args[1].toUpperCase();
        const to = getCleanAccount(args[2]);
        const fromAccount = getCleanAccount(flags.from || await context.wallet.getCurrentAccount());
        const isMock = flags.mock;
        
        if (!fromAccount || !to) {
          context.error('Invalid account names');
          return;
        }
        
        // Validate amount
        let validatedAmount;
        try {
          validatedAmount = validateTokenAmount(amount);
        } catch (error) {
          context.error(error.message);
          return;
        }
        
        // Get token info
        context.log(`🔍 Validating ${symbol} token...`);
        const tokenInfo = await rpcCall('/contracts', 'findOne', {
          contract: 'tokens',
          table: 'tokens',
          query: { symbol }
        });
        
        if (!tokenInfo) {
          context.error(`Token ${symbol} not found on HiveEngine`);
          return;
        }
        
        // Check if user is the issuer
        if (tokenInfo.issuer !== fromAccount) {
          context.error(`Only the token issuer (@${tokenInfo.issuer}) can issue new ${symbol} tokens`);
          return;
        }
        
        // Format amount with correct precision
        const precision = tokenInfo.precision || 3;
        const formattedAmount = parseFloat(amount).toFixed(precision);
        
        // Check max supply if applicable
        if (tokenInfo.maxSupply) {
          const currentSupply = parseFloat(tokenInfo.supply || 0);
          const newSupply = currentSupply + parseFloat(formattedAmount);
          const maxSupplyNum = parseFloat(tokenInfo.maxSupply);
          
          if (newSupply > maxSupplyNum) {
            context.error(`Cannot issue ${formattedAmount} ${symbol}. Would exceed max supply of ${tokenInfo.maxSupply}`);
            context.log(`Current supply: ${currentSupply} ${symbol}`);
            context.log(`Remaining capacity: ${(maxSupplyNum - currentSupply).toFixed(precision)} ${symbol}`);
            return;
          }
        }
        
        // Show issuance summary
        context.success(`\n🏭 HIVEENGINE TOKEN ISSUANCE\n`);
        context.log(`Issuer:      @${fromAccount}`);
        context.log(`Recipient:   @${to}`);
        context.log(`Amount:      ${formattedAmount} ${symbol}`);
        context.log(`Token:       ${tokenInfo.name} (${symbol})`);
        if (tokenInfo.maxSupply) {
          const currentSupply = parseFloat(tokenInfo.supply || 0);
          const newSupply = currentSupply + parseFloat(formattedAmount);
          context.log(`Supply:      ${newSupply}/${tokenInfo.maxSupply} ${symbol}`);
        } else {
          context.log(`Supply:      Unlimited`);
        }
        context.log('');
        
        if (isMock) {
          context.success('✅ MOCK MODE: Token issuance validated but not executed');
          return;
        }
        
        context.log('📡 Issuing HiveEngine tokens...');
        
        const result = await createHiveEngineTransaction(
          fromAccount,
          'tokens',
          'issue',
          {
            symbol,
            to,
            quantity: formattedAmount
          }
        );
        
        // Consolidate all success messages into one block to avoid display issues
        const transactionId = (result && result.id) ? result.id : 'Processing...';
        
        context.success('✅ Token issuance submitted to blockchain!');
        context.success(`📋 Transaction ID: ${transactionId}`);
        context.success(`🎯 ${formattedAmount} ${symbol} tokens issued to @${to}`);
        context.success('⏳ Transaction may take a few minutes to confirm on HiveEngine');
        
        // Force process exit immediately to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Token issuance failed: ${error.message}`);
      }
    });

    // Enhanced wizard command - text-based interactive creation
    context.addCommand('he-wizard', 'Interactive token creation wizard (text-based)', async (args, flags) => {
      try {
        const currentAccount = await context.wallet.getCurrentAccount();
        if (!currentAccount) {
          context.error('No account selected. Please login first.');
          return;
        }

        context.success('🏭 HiveEngine Token Creation Wizard');
        context.log(`Account: @${currentAccount}`);
        context.log('');

        // Helper function to get user input (simulated for this plugin environment)
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const ask = (question) => {
          return new Promise((resolve) => {
            rl.question(question, (answer) => {
              resolve(answer.trim());
            });
          });
        };

        try {
          // Step 1: Token Name
          context.log('📝 Step 1: Token Name');
          context.log('Requirements: letters, numbers, spaces only, max 50 characters');
          const name = await ask('Enter token name: ');
          
          if (!name || name.length > 50 || !/^[A-Za-z0-9\s]+$/.test(name)) {
            context.error('Invalid token name. Please try again with he-create command.');
            rl.close();
            return;
          }

          // Step 2: Symbol
          context.log('');
          context.log('🎯 Step 2: Token Symbol');
          context.log('Requirements: uppercase letters only, max 10 characters');
          const symbol = (await ask('Enter token symbol: ')).toUpperCase();
          
          if (!symbol || symbol.length > 10 || !/^[A-Z]+$/.test(symbol)) {
            context.error('Invalid symbol. Please try again with he-create command.');
            rl.close();
            return;
          }

          // Step 3: Precision
          context.log('');
          context.log('🔢 Step 3: Decimal Precision');
          context.log('Requirements: number between 0-8 (default: 3)');
          const precisionInput = await ask('Enter precision (or press enter for 3): ');
          const precision = precisionInput || '3';
          
          if (!/^[0-8]$/.test(precision)) {
            context.error('Invalid precision. Please try again with he-create command.');
            rl.close();
            return;
          }

          // Step 4: Max Supply
          context.log('');
          context.log('💰 Step 4: Maximum Supply');
          context.log('Requirements: numbers only (default: 1000000)');
          const maxSupplyInput = await ask('Enter max supply (or press enter for 1000000): ');
          const maxSupply = maxSupplyInput || '1000000';
          
          if (!/^[0-9]+$/.test(maxSupply)) {
            context.error('Invalid max supply. Please try again with he-create command.');
            rl.close();
            return;
          }

          // Step 5: URL (optional)
          context.log('');
          context.log('🌐 Step 5: Website URL (Optional)');
          context.log('Requirements: max 255 characters');
          const url = await ask('Enter website URL (or press enter to skip): ');
          
          if (url && url.length > 255) {
            context.error('URL too long. Please try again with he-create command.');
            rl.close();
            return;
          }

          rl.close();

          // Show summary and confirm
          context.success('\n📋 TOKEN CREATION SUMMARY');
          context.log(`Account:     @${currentAccount}`);
          context.log(`Name:        ${name}`);
          context.log(`Symbol:      ${symbol}`);
          context.log(`Precision:   ${precision} decimal places`);
          context.log(`Max Supply:  ${parseInt(maxSupply).toLocaleString()} ${symbol}`);
          if (url) {
            context.log(`Website:     ${url}`);
          }
          context.log('');

          // Check if user has active key before asking for confirmation
          context.log('🔐 Checking active key availability...');
          try {
            // Try to get account list to check if keys are available
            const accounts = await context.wallet.getAccountList();
            if (!accounts.includes(currentAccount)) {
              context.error(`❌ Account @${currentAccount} not found in key vault.`);
              context.log('Please log in first with: beeline login ' + currentAccount);
              rl.close();
              return;
            }
          } catch (error) {
            context.error(`❌ Unable to verify account keys: ${error.message}`);
            rl.close();
            return;
          }

          // Ask for confirmation
          const confirm = await ask('✅ Create this token? (y/N/test): ');
          
          if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            // Create real token
            context.log('📡 Creating HiveEngine token...');
            try {
              const result = await executeTokenCreation(name, symbol, precision, maxSupply, url, false);
              context.success(`✅ Token created successfully! Transaction ID: ${result.id}`);
              context.log(`🔍 View at: https://hiveblocks.com/tx/${result.id}`);
            } catch (error) {
              context.error(`❌ Token creation failed: ${error.message}`);
            }
          } else if (confirm.toLowerCase() === 'test' || confirm.toLowerCase() === 't') {
            // Test mode
            context.log('🧪 Testing token creation (mock mode)...');
            try {
              await executeTokenCreation(name, symbol, precision, maxSupply, url, true);
              context.success('✅ Mock test completed successfully!');
            } catch (error) {
              context.error(`❌ Mock test failed: ${error.message}`);
            }
          } else {
            context.log('❌ Token creation cancelled.');
            context.log('');
            context.log('💡 You can create this token later with:');
            context.log(`beeline run-plugin he-create "${name}" ${symbol} --precision ${precision} --max-supply ${maxSupply}${url ? ` --url "${url}"` : ''} --mock`);
            context.log('⚠️  Remove --mock flag to create the real token');
          }

          // Helper function to execute token creation
          async function executeTokenCreation(name, symbol, precision, maxSupply, url, isMock) {
            const contractPayload = {
              name,
              symbol: symbol.toUpperCase(),
              precision: parseInt(precision)
            };
            
            if (maxSupply) {
              contractPayload.maxSupply = maxSupply;
            }
            
            if (url) {
              contractPayload.url = url;
            }

            if (isMock) {
              context.success('✅ MOCK MODE: Token creation validated successfully!');
              context.log('This would create:');
              context.log(JSON.stringify(contractPayload, null, 2));
              return { id: 'mock-transaction-id' };
            } else {
              // Check if token already exists
              try {
                const existingToken = await rpcCall('/contracts', 'findOne', {
                  contract: 'tokens',
                  table: 'tokens',
                  query: { symbol: symbol.toUpperCase() }
                });
                
                if (existingToken) {
                  throw new Error(`Token ${symbol.toUpperCase()} already exists on HiveEngine`);
                }
              } catch (error) {
                if (!error.message.includes('already exists')) {
                  context.log('⚠️  Could not verify symbol uniqueness, proceeding...');
                }
              }

              return await createHiveEngineTransaction(
                currentAccount,
                'tokens',
                'create',
                contractPayload
              );
            }
          }

        } catch (error) {
          rl.close();
          throw error;
        }
        
      } catch (error) {
        context.error(`Wizard failed: ${error.message}`);
      }
    });
    
    // Plugin activation complete - only show in verbose mode
    if (process.env.BEELINE_VERBOSE || process.env.DEBUG) {
      context.success('🚀 HiveEngine Plugin Loaded!');
      context.log('');
      context.log('Available commands:');
      context.log('');
      context.log('📊 INFORMATION:');
      context.log('  he-tokens [account]       - Show token balances');
      context.log('  he-info <symbol>          - Get token information');
      context.log('  he-market <symbol>        - Show market data');
      context.log('  he-top [limit]            - Top tokens by volume');
      context.log('  he-nfts [account]         - Show NFT collections');
      context.log('  he-mining                 - Mining pool stats');
      context.log('  he-test                   - Test API connectivity');
      context.log('');
      context.log('💸 TRANSACTIONS:');
      context.log('  he-transfer <to> <amount> <symbol> [memo] - Transfer tokens');
      context.log('  he-stake <amount> <symbol>                - Stake tokens');
      context.log('  he-unstake <amount> <symbol>              - Unstake tokens');
      context.log('  he-delegate <amount> <symbol> <to>        - Delegate staked tokens');
      context.log('  he-undelegate <amount> <symbol> <from>    - Undelegate tokens');
      context.log('');
      context.log('💹 MARKET TRADING:');
      context.log('  he-sell <amount> <symbol> <price>         - Create limit sell order');
      context.log('  he-buy <amount> <symbol> <price>          - Create limit buy order');
      context.log('  he-market-sell <amount> <symbol>          - Market sell at current rate');
      context.log('  he-market-buy <hive_amount> <symbol>      - Market buy with SWAP.HIVE');
      context.log('  he-cancel <buy|sell> <order_id>           - Cancel an order');
      context.log('');
      context.log('🏭 TOKEN CREATION:');
      context.log('  he-create <name> <symbol> [options]       - Create new token');
      context.log('  he-wizard                                 - Interactive token creation wizard');
      context.log('  he-issue <amount> <symbol> <to>           - Issue tokens (creator only)');
      context.log('');
      context.log('Examples:');
      context.log('  beeline run-plugin he-tokens beggars');
      context.log('  beeline run-plugin he-transfer alice 10 BEE "Payment"');
      context.log('  beeline run-plugin he-stake 50 LEO');
      context.log('  beeline run-plugin he-delegate 25 LEO alice          # Delegate 25 staked LEO');
      context.log('  beeline run-plugin he-sell 100 LEO 1.5               # Limit sell 100 LEO at 1.5');
      context.log('  beeline run-plugin he-market-buy 10 BEE               # Spend 10 SWAP.HIVE on BEE');
      context.log('  beeline run-plugin he-cancel sell 64a5f2b1...         # Cancel sell order');
      context.log('  beeline run-plugin he-create "My Token" MYTOKEN --precision 8');
      context.log('  beeline run-plugin he-issue 1000 MYTOKEN alice');
      context.log('  beeline run-plugin he-transfer alice 10 BEE --mock   # Safe testing');
    }
  }
};

module.exports = plugin;