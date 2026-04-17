require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ccxt = require('ccxt');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Binance exchange
const initExchange = () => {
    return new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET_KEY,
        enableRateLimit: true,
        options: {
            defaultType: 'spot'
        }
    });
};

// Helper to calculate average price from trades
const calculateAveragePrice = async (exchange, symbol) => {
    try {
        // Fetch up to 1000 recent trades (Binance limit for a single call without specific time ranges)
        // If the user has more trades, we might need pagination, but this covers 99% of simple cases.
        const trades = await exchange.fetchMyTrades(symbol, undefined, 1000);
        
        let currentQty = 0;
        let totalCost = 0;

        for (const trade of trades) {
            const amount = parseFloat(trade.amount);
            const price = parseFloat(trade.price);
            const cost = amount * price;

            if (trade.side === 'buy') {
                currentQty += amount;
                totalCost += cost;
            } else if (trade.side === 'sell') {
                if (currentQty > 0) {
                    // Average cost per unit before this sell
                    const avgCost = totalCost / currentQty;
                    currentQty -= amount;
                    if (currentQty <= 0) {
                        currentQty = 0;
                        totalCost = 0;
                    } else {
                        totalCost = currentQty * avgCost;
                    }
                }
            }
        }

        if (currentQty > 0) {
            return totalCost / currentQty;
        }
        return 0; // If they sold everything but have dust left
    } catch (e) {
        console.error(`Error fetching trades for ${symbol}:`, e.message);
        return 0;
    }
};

app.get('/api/portfolio', async (req, res) => {
    try {
        if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
            return res.status(400).json({ error: 'Binance API keys are missing in .env file.' });
        }

        const exchange = initExchange();
        
        // Fetch account balance
        const balanceResponse = await exchange.fetchBalance();
        const totalBalances = balanceResponse.total;
        
        // Filter out zero balances (ignoring tiny dust < 0.00000001)
        const nonZeroAssets = {};
        for (const [asset, amount] of Object.entries(totalBalances)) {
            if (amount > 0.00000001) {
                nonZeroAssets[asset] = amount;
            }
        }

        // Fetch all tickers to get current prices
        const tickers = await exchange.fetchTickers();
        
        const portfolio = [];
        let totalPortfolioValueUSDT = 0;
        let totalPortfolioCostUSDT = 0;

        for (const [asset, amount] of Object.entries(nonZeroAssets)) {
            if (asset === 'USDT') {
                portfolio.push({
                    asset,
                    amount,
                    price: 1,
                    value: amount,
                    avgPrice: 1,
                    pnl: 0,
                    pnlPercentage: 0
                });
                totalPortfolioValueUSDT += amount;
                totalPortfolioCostUSDT += amount;
                continue;
            }

            // Look for USDT pair, e.g., BTC/USDT
            const pair = `${asset}/USDT`;
            let price = 0;
            
            if (tickers[pair]) {
                price = tickers[pair].last;
            }

            const value = amount * price;
            totalPortfolioValueUSDT += value;

            let avgPrice = 0;
            let pnl = 0;
            let pnlPercentage = 0;

            // Only calculate if we found a valid USDT pair to check trades against
            if (price > 0 && exchange.has['fetchMyTrades']) {
                avgPrice = await calculateAveragePrice(exchange, pair);
                
                if (avgPrice > 0) {
                    const costBasis = amount * avgPrice;
                    pnl = value - costBasis;
                    pnlPercentage = (pnl / costBasis) * 100;
                    totalPortfolioCostUSDT += costBasis;
                } else {
                    // If no trade history, assume cost is current value (no pnl)
                    totalPortfolioCostUSDT += value;
                }
            } else {
                totalPortfolioCostUSDT += value;
            }

            portfolio.push({
                asset,
                amount,
                price,
                value,
                avgPrice,
                pnl,
                pnlPercentage
            });
        }

        // Sort by value descending
        portfolio.sort((a, b) => b.value - a.value);

        const totalPnl = totalPortfolioValueUSDT - totalPortfolioCostUSDT;
        const totalPnlPercentage = totalPortfolioCostUSDT > 0 ? (totalPnl / totalPortfolioCostUSDT) * 100 : 0;

        res.json({
            success: true,
            totalValue: totalPortfolioValueUSDT,
            totalPnl: totalPnl,
            totalPnlPercentage: totalPnlPercentage,
            assets: portfolio
        });

    } catch (error) {
        console.error('Error fetching portfolio:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export the Express API for Vercel
module.exports = app;

// Start the server locally only if not running on Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}
