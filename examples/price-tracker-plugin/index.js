// Cryptocurrency Price Tracker Plugin for Beeline Wallet
// Tracks crypto prices including HIVE and HBD

const plugin = {
  name: 'price-tracker-plugin',
  description: 'Track cryptocurrency prices including HIVE and HBD',
  version: '1.0.0',
  
  activate(context) {
    const API_BASE = 'https://api.coingecko.com/api/v3';
    
    // Format price for display
    function formatPrice(price, currency = 'usd') {
      const symbol = currency === 'usd' ? '$' : currency.toUpperCase();
      if (price < 0.01) {
        return `${symbol}${price.toFixed(6)}`;
      } else if (price < 1) {
        return `${symbol}${price.toFixed(4)}`;
      } else {
        return `${symbol}${price.toFixed(2)}`;
      }
    }
    
    // Format percentage change with proper colors
    function formatChange(change) {
      if (!change) return 'N/A';
      const symbol = change >= 0 ? '+' : '';
      const percentage = `${symbol}${change.toFixed(2)}%`;
      
      // Use context methods for proper color formatting
      if (change >= 0) {
        return `🟢 ${percentage}`;
      } else {
        return `🔴 ${percentage}`;
      }
    }
    
    // COMMAND: Show prices
    context.addCommand('prices', 'Show cryptocurrency prices including HIVE', async (args, flags) => {
      try {
        const currency = args[0] || 'usd';
        context.log(`📊 Fetching cryptocurrency prices in ${currency.toUpperCase()}...`);
        
        // Get prices for major cryptos including HIVE ecosystem
        const coins = 'bitcoin,ethereum,binancecoin,cardano,solana,polkadot,chainlink,hive,hive_dollar';
        const response = await fetch(`${API_BASE}/simple/price?ids=${coins}&vs_currencies=${currency}&include_24hr_change=true&include_market_cap=true`);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        context.success(`\n💰 CRYPTOCURRENCY PRICES (${currency.toUpperCase()})\n`);
        
        // Define coin display order and names
        const coinOrder = [
          { id: 'bitcoin', name: 'Bitcoin (BTC)' },
          { id: 'ethereum', name: 'Ethereum (ETH)' },
          { id: 'binancecoin', name: 'BNB' },
          { id: 'cardano', name: 'Cardano (ADA)' },
          { id: 'solana', name: 'Solana (SOL)' },
          { id: 'polkadot', name: 'Polkadot (DOT)' },
          { id: 'chainlink', name: 'Chainlink (LINK)' },
          { id: 'hive', name: 'Hive (HIVE)' },
          { id: 'hive_dollar', name: 'Hive Dollar (HBD)' }
        ];
        
        coinOrder.forEach(coin => {
          const priceData = data[coin.id];
          if (priceData) {
            const price = formatPrice(priceData[currency]);
            const change = formatChange(priceData[`${currency}_24h_change`]);
            const marketCap = priceData.market_cap ? 
              `$${(priceData.market_cap / 1000000).toFixed(0)}M` : 
              'N/A';
            
            context.success(`⚡ ${coin.name.padEnd(20)} ${price.padStart(12)} ${change.padStart(20)} MC: ${marketCap.padStart(8)}`);
          }
        });
        
        context.success(`\n📊 Updated: ${new Date().toLocaleTimeString()}`);
        context.success('💡 Tip: Use "beeline run-plugin hive-price" for detailed HIVE analysis\n');
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to fetch prices: ${error.message}`);
      }
    });
    
    // COMMAND: HIVE specific price analysis
    context.addCommand('hive-price', 'Detailed HIVE price analysis and portfolio value', async (args, flags) => {
      try {
        context.log('🔍 Analyzing HIVE ecosystem prices...');
        
        // Get detailed HIVE data
        const response = await fetch(`${API_BASE}/coins/hive?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const market = data.market_data;
        
        context.success(`\n🔮 HIVE ECOSYSTEM ANALYSIS\n`);
        
        // Current prices
        context.success(`💰 CURRENT PRICES`);
        context.success(`HIVE:           ${formatPrice(market.current_price.usd)}`);
        context.success(`Market Cap:     $${(market.market_cap.usd / 1000000).toFixed(1)}M`);
        context.success(`24h Volume:     $${(market.total_volume.usd / 1000000).toFixed(1)}M`);
        context.success(`Circulating:    ${(market.circulating_supply / 1000000).toFixed(1)}M HIVE`);
        
        // Price changes
        context.success(`\n📈 PRICE CHANGES`);
        context.success(`1 Hour:         ${formatChange(market.price_change_percentage_1h_in_currency?.usd)}`);
        context.success(`24 Hours:       ${formatChange(market.price_change_percentage_24h)}`);
        context.success(`7 Days:         ${formatChange(market.price_change_percentage_7d)}`);
        context.success(`30 Days:        ${formatChange(market.price_change_percentage_30d)}`);
        context.success(`1 Year:         ${formatChange(market.price_change_percentage_1y)}`);
        
        // Price extremes
        context.success(`\n🎯 PRICE LEVELS`);
        context.success(`24h High:       ${formatPrice(market.high_24h.usd)}`);
        context.success(`24h Low:        ${formatPrice(market.low_24h.usd)}`);
        context.success(`All-Time High:  ${formatPrice(market.ath.usd)} (${new Date(market.ath_date.usd).toLocaleDateString()})`);
        context.success(`All-Time Low:   ${formatPrice(market.atl.usd)} (${new Date(market.atl_date.usd).toLocaleDateString()})`);
        
        // Try to get user's HIVE balance for portfolio calculation
        try {
          const currentAccount = await context.wallet.getCurrentAccount();
          if (currentAccount) {
            const balance = await context.wallet.getBalance(currentAccount);
            if (balance && balance.hive) {
              const hiveAmount = parseFloat(balance.hive.replace(' HIVE', ''));
              const hbdAmount = parseFloat(balance.hbd.replace(' HBD', ''));
              const portfolioValue = (hiveAmount * market.current_price.usd) + hbdAmount;
              
              context.success(`\n💼 YOUR PORTFOLIO (@${currentAccount})`);
              context.success(`HIVE Balance:   ${hiveAmount.toFixed(3)} HIVE = ${formatPrice(hiveAmount * market.current_price.usd)}`);
              context.success(`HBD Balance:    ${hbdAmount.toFixed(3)} HBD = ${formatPrice(hbdAmount)}`);
              context.success(`Total Value:    ${formatPrice(portfolioValue)}`);
            }
          }
        } catch (error) {
          // Silently skip portfolio calculation if no wallet access
        }
        
        context.success('');
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to fetch HIVE analysis: ${error.message}`);
      }
    });
    
    // COMMAND: Price comparison
    context.addCommand('compare', 'Compare prices between cryptocurrencies', async (args, flags) => {
      try {
        if (args.length < 2) {
          context.error('Usage: compare <coin1> <coin2> [coin3...]');
          context.log('Example: beeline run-plugin compare bitcoin hive ethereum');
          return;
        }
        
        const coins = args.join(',');
        context.log(`📊 Comparing prices for: ${args.join(', ').toUpperCase()}...`);
        
        const response = await fetch(`${API_BASE}/simple/price?ids=${coins}&vs_currencies=usd,btc&include_24hr_change=true`);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        context.success(`\n🔍 PRICE COMPARISON\n`);
        context.success(`COIN           USD PRICE      BTC PRICE      24H CHANGE`);
        context.success(`──────────────────────────────────────────────────────`);
        
        args.forEach(coin => {
          const priceData = data[coin];
          if (priceData) {
            const usdPrice = formatPrice(priceData.usd).padStart(12);
            const btcPrice = `₿${priceData.btc.toFixed(8)}`.padStart(12);
            const change = formatChange(priceData.usd_24h_change);
            
            context.success(`${coin.toUpperCase().padEnd(12)} ${usdPrice} ${btcPrice} ${change}`);
          } else {
            context.success(`${coin.toUpperCase().padEnd(12)} NOT FOUND`);
          }
        });
        
        context.success('');
        
        // Force process exit to prevent hanging
        setTimeout(() => {
          process.exit(0);
        }, 50);
        
      } catch (error) {
        context.error(`Failed to compare prices: ${error.message}`);
      }
    });
    
    // Plugin activation complete - only show in verbose mode
    if (process.env.BEELINE_VERBOSE || process.env.DEBUG) {
      context.success('💰 Price Tracker Plugin Loaded!');
      context.log('');
      context.log('Available commands:');
      context.log('  prices [currency]     - Show major crypto prices (default: USD)');
      context.log('  hive-price           - Detailed HIVE analysis with portfolio value');
      context.log('  compare <coins...>   - Compare multiple cryptocurrency prices');
      context.log('');
      context.log('Examples:');
      context.log('  beeline run-plugin prices');
      context.log('  beeline run-plugin hive-price');
      context.log('  beeline run-plugin compare bitcoin hive ethereum');
      context.log('');
    }
  }
};

module.exports = plugin;