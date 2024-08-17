const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const mongoose = require('mongoose');
const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bs58 = require('bs58');
const pino = require("pino");
require("dotenv").config();

// Set up logger
const logger = pino({ level: "debug" });

// Initialize bot, database, and Solana connection
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const connection = new Connection('https://api.mainnet-beta.solana.com');

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Define schemas
const UserSchema = new mongoose.Schema({
  userId: String,
  wallets: [{ address: String, privateKey: String }],
  referralCode: String,
  referredBy: String,
  settings: {
    slippage: { type: Number, default: 0.5 },
    autoBuy: { type: Boolean, default: false },
    autoSell: { type: Boolean, default: false }
  },
  snipers: [{
    tokenAddress: String,
    amount: Number,
    maxPrice: Number,
    type: String
  }],
  limitOrders: [{
    type: String,
    tokenAddress: String,
    amount: Number,
    price: Number
  }],
  dcaOrders: [{
    tokenAddress: String,
    totalAmount: Number,
    interval: Number,
    numberOfOrders: Number,
    executedOrders: Number
  }]
});

const User = mongoose.model('User', UserSchema);

// Helper functions
async function getSolPrice() {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    return response.data.solana.usd;
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    return 'N/A';
  }
}

async function getTokenInfo(address) {
  try {
    const response = await axios.get(`https://public-api.solscan.io/token/meta?tokenAddress=${address}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching token info:', error);
    return null;
  }
}

async function createWallet(userId) {
  const keypair = Keypair.generate();
  const user = await User.findOne({ userId });
  user.wallets.push({
    address: keypair.publicKey.toString(),
    privateKey: bs58.encode(keypair.secretKey)
  });
  await user.save();
  return keypair.publicKey.toString();
}

async function buyToken(walletAddress, tokenAddress, amountInSol) {
  // Placeholder for actual buying logic
  console.log(`Buying ${amountInSol} SOL worth of ${tokenAddress} for wallet ${walletAddress}`);
  return "Transaction successful";
}

async function sellToken(walletAddress, tokenAddress, amount) {
  // Placeholder for actual selling logic
  console.log(`Selling ${amount} of ${tokenAddress} for wallet ${walletAddress}`);
  return "Transaction successful";
}

// Start command
bot.command('start', async (ctx) => {
  try {
    let user = await User.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
      user = new User({
        userId: ctx.from.id.toString(),
        referralCode: Math.random().toString(36).substring(7),
      });
      await user.save();
    }

    const solPrice = await getSolPrice();

    ctx.reply(
      `🚀 DegenSolTrader: Your Gateway to Solana DeFi 🤖\n\n` +
      `Telegram | Twitter | Website\n\n` +
      `💎 SOL: $${solPrice}\n\n` +
      `Ready to make some gains? Let's go!`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✨ Buy & Sell", "buy_sell"), Markup.button.callback("🎯 Token Sniper", "token_sniper")],
        [Markup.button.callback("🎯 Sniper Pumpfun", "sniper_pumpfun"), Markup.button.callback("🎯 Sniper Moonshot", "sniper_moonshot")],
        [Markup.button.callback("✍️ Limit Orders", "limit_orders"), Markup.button.callback("✍️ DCA Orders", "dca_orders")],
        [Markup.button.callback("👤 Profile", "profile"), Markup.button.callback("💳 Wallets", "wallets"), Markup.button.callback("🎮 Trades", "trades")],
        [Markup.button.callback("🎮 Copy Trades", "copy_trades"), Markup.button.callback("👥 Referral System", "referral_system")],
        [Markup.button.callback("🏆 Ranking Top Vol", "ranking"), Markup.button.callback("💰 Claim Top Vol", "claim_top_vol")],
        [Markup.button.callback("✉️ Transfer SOL", "transfer_sol"), Markup.button.callback("⚙️ Settings", "settings")],
      ])
    );
  } catch (error) {
    console.error(`Error in start command:`, error);
    ctx.reply("Oops! Something went wrong. Try again or contact support if the issue persists.");
  }
});

// Buy & Sell
bot.action('buy_sell', async (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Enter the token address you want to buy or sell:");
  bot.on('text', async (ctx) => {
    const tokenAddress = ctx.message.text;
    const tokenInfo = await getTokenInfo(tokenAddress);
    if (tokenInfo) {
      ctx.reply(
        `Token: ${tokenInfo.symbol}\n` +
        `Price: $${tokenInfo.price}\n` +
        `24h Change: ${tokenInfo.priceChange24h}%\n\n` +
        `What do you want to do?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("Buy", `buy_${tokenAddress}`), Markup.button.callback("Sell", `sell_${tokenAddress}`)],
        ])
      );
    } else {
      ctx.reply("Token not found. Check the address and try again.");
    }
  });
});

bot.action(/buy_(.+)/, async (ctx) => {
  const tokenAddress = ctx.match[1];
  ctx.reply("Enter the amount of SOL you want to spend:");
  bot.on('text', async (ctx) => {
    const amount = parseFloat(ctx.message.text);
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (user && user.wallets.length > 0) {
      const result = await buyToken(user.wallets[0].address, tokenAddress, amount);
      ctx.reply(result);
    } else {
      ctx.reply("No wallet found. Please create a wallet first.");
    }
  });
});

bot.action(/sell_(.+)/, async (ctx) => {
  const tokenAddress = ctx.match[1];
  ctx.reply("Enter the amount of tokens you want to sell:");
  bot.on('text', async (ctx) => {
    const amount = parseFloat(ctx.message.text);
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (user && user.wallets.length > 0) {
      const result = await sellToken(user.wallets[0].address, tokenAddress, amount);
      ctx.reply(result);
    } else {
      ctx.reply("No wallet found. Please create a wallet first.");
    }
  });
});

// Token Sniper
bot.action('token_sniper', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    "🎯 Token Sniper activated! Enter the details:\n" +
    "Format: <token_address> <amount_in_SOL> <max_price_in_USD>"
  );
  bot.on('text', async (ctx) => {
    const [address, amount, maxPrice] = ctx.message.text.split(' ');
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.snipers.push({
      tokenAddress: address,
      amount: parseFloat(amount),
      maxPrice: parseFloat(maxPrice),
      type: 'regular'
    });
    await user.save();
    ctx.reply(`Sniping set up for ${address}. Max ${amount} SOL if price <= $${maxPrice}`);
  });
});

// Sniper Pumpfun
bot.action('sniper_pumpfun', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🚀 Pumpfun Sniper! Enter: <token_address> <amount_in_SOL> <target_percentage>");
  bot.on('text', async (ctx) => {
    const [address, amount, targetPercentage] = ctx.message.text.split(' ');
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.snipers.push({
      tokenAddress: address,
      amount: parseFloat(amount),
      maxPrice: parseFloat(targetPercentage),
      type: 'pumpfun'
    });
    await user.save();
    ctx.reply(`Pumpfun sniper set for ${address}. ${amount} SOL when price increases by ${targetPercentage}%`);
  });
});

// Sniper Moonshot
bot.action('sniper_moonshot', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🌙 Moonshot Sniper! Enter: <token_address> <amount_in_SOL> <stop_loss> <take_profit>");
  bot.on('text', async (ctx) => {
    const [address, amount, stopLoss, takeProfit] = ctx.message.text.split(' ');
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.snipers.push({
      tokenAddress: address,
      amount: parseFloat(amount),
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      type: 'moonshot'
    });
    await user.save();
    ctx.reply(`Moonshot sniper set for ${address}. ${amount} SOL, SL: ${stopLoss}%, TP: ${takeProfit}%`);
  });
});

// Limit Orders
bot.action('limit_orders', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("✍️ Limit Orders. Enter: <buy/sell> <token_address> <amount> <price>");
  bot.on('text', async (ctx) => {
    const [type, address, amount, price] = ctx.message.text.split(' ');
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.limitOrders.push({
      type,
      tokenAddress: address,
      amount: parseFloat(amount),
      price: parseFloat(price)
    });
    await user.save();
    ctx.reply(`Limit order set: ${type} ${amount} of ${address} at $${price}`);
  });
});

// DCA Orders
bot.action('dca_orders', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("💰 DCA Orders. Enter: <token_address> <total_amount> <interval_in_hours> <number_of_orders>");
  bot.on('text', async (ctx) => {
    const [address, totalAmount, interval, numberOfOrders] = ctx.message.text.split(' ');
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.dcaOrders.push({
      tokenAddress: address,
      totalAmount: parseFloat(totalAmount),
      interval: parseFloat(interval),
      numberOfOrders: parseInt(numberOfOrders),
      executedOrders: 0
    });
    await user.save();
    ctx.reply(`DCA order set for ${address}. Total: ${totalAmount} SOL, Interval: ${interval}h, Orders: ${numberOfOrders}`);
  });
});

// Profile
bot.action('profile', async (ctx) => {
  ctx.answerCbQuery();
  const user = await User.findOne({ userId: ctx.from.id.toString() });
  if (user) {
    ctx.reply(
      `👤 Profile\n\n` +
      `Referral Code: ${user.referralCode}\n` +
      `Referrals: ${user.referredBy ? "1" : "0"}\n` +
      `Wallets: ${user.wallets.length}\n` +
      `Active Snipers: ${user.snipers.length}\n` +
      `Limit Orders: ${user.limitOrders.length}\n` +
      `DCA Orders: ${user.dcaOrders.length}`
    );
  } else {
    ctx.reply("Profile not found. Please start the bot first.");
  }
});

// Wallets
bot.action('wallets', async (ctx) => {
  ctx.answerCbQuery();
  const user = await User.findOne({ userId: ctx.from.id.toString() });
  if (user && user.wallets.length > 0) {
    let message = "Your wallets:\n\n";
    for (let wallet of user.wallets) {
      const balance = await connection.getBalance(new PublicKey(wallet.address));
      message += `Address: ${wallet.address}\nBalance: ${balance / LAMPORTS_PER_SOL} SOL\n\n`;
    }
    ctx.reply(message, Markup.inlineKeyboard([[Markup.button.callback("Create New Wallet", "create_wallet")]]));
  } else {
    ctx.reply("No wallets found. Create one now!", Markup.inlineKeyboard([[Markup.button.callback("Create Wallet", "create_wallet")]]));
  }
});

bot.action('create_wallet', async (ctx) => {
  ctx.answerCbQuery();
  const address = await createWallet(ctx.from.id.toString());
  ctx.reply(`New wallet created! Address: ${address}`);
});

// Trades
bot.action('trades', async (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Recent trades feature coming soon!");
});

// Copy Trades
bot.action('copy_trades', async (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Enter the address of the trader you want to copy:");
  bot.on('text', async (ctx) => {
    const traderAddress = ctx.message.text;
    ctx.reply(`You are now copying trades from ${traderAddress}. (Feature in development)`);
  });
});

// Referral System
bot.action('referral_system', async (ctx) => {
  ctx.answerCbQuery();
  const user = await User.findOne({ userId: ctx.from.id.toString() });
  ctx.reply(
    `Your referral code: ${user.referralCode}\n` +
    `Share this code with your friends to earn rewards!\n\n` +
    `To enter a referral code, use /referral <code>`
  );
});

bot.command('referral', async (ctx) => {
  try {
    const [_, referralCode] = ctx.message.text.split(" ");
    if (!referralCode) {
      return ctx.reply(
        "Please provide a referral code. Usage: /referral <code>"
      );
    }

    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
      return ctx.reply("User not found. Please start the bot again.");
    }

    if (user.referredBy) {
      return ctx.reply("You have already used a referral code.");
    }
    const referrer = await User.findOne({ referralCode: referralCode });
    if (!referrer) {
      return ctx.reply("Invalid referral code. Please try again.");
    }

    user.referredBy = referralCode;
    await user.save();

    ctx.reply("Referral code applied successfully!");
  } catch (error) {
    logger.error(`Error applying referral code: ${error.message}`);
    ctx.reply(
      "An error occurred while applying the referral code. Please try again."
    );
  }
});

bot.hears("⚙️ Settings", async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
      return ctx.reply("User not found. Please start the bot again.");
    }

    ctx.reply(
      `Current Settings:\n\n` +
        `Slippage: ${user.settings.slippage}%\n` +
        `Auto-buy: ${user.settings.autoBuy ? "On" : "Off"}\n` +
        `Auto-sell: ${user.settings.autoSell ? "On" : "Off"}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Set Slippage", "set_slippage")],
        [
          Markup.button.callback(
            `${user.settings.autoBuy ? "Disable" : "Enable"} Auto-buy`,
            "toggle_auto_buy"
          ),
        ],
        [
          Markup.button.callback(
            `${user.settings.autoSell ? "Disable" : "Enable"} Auto-sell`,
            "toggle_auto_sell"
          ),
        ],
      ])
    );
  } catch (error) {
    logger.error(`Error accessing settings: ${error.message}`);
    ctx.reply("An error occurred while accessing settings. Please try again.");
  }
});

bot.action("set_slippage", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Enter new slippage percentage (e.g., 0.5 for 0.5%):");
  bot.on("text", async (ctx) => {
    const slippage = parseFloat(ctx.message.text);
    if (isNaN(slippage) || slippage < 0 || slippage > 100) {
      return ctx.reply(
        "Invalid slippage. Please enter a number between 0 and 100."
      );
    }
    await User.updateOne(
      { userId: ctx.from.id.toString() },
      { "settings.slippage": slippage }
    );
    ctx.reply(`Slippage updated to ${slippage}%`);
  });
});

bot.action("toggle_auto_buy", async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.settings.autoBuy = !user.settings.autoBuy;
    await user.save();
    ctx.answerCbQuery(
      `Auto-buy is now ${user.settings.autoBuy ? "On" : "Off"}`
    );
  } catch (error) {
    logger.error(`Error toggling auto-buy: ${error.message}`);
    ctx.answerCbQuery(
      "An error occurred while toggling auto-buy. Please try again."
    );
  }
});

bot.action("toggle_auto_sell", async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.settings.autoSell = !user.settings.autoSell;
    await user.save();
    ctx.answerCbQuery(
      `Auto-sell is now ${user.settings.autoSell ? "On" : "Off"}`
    );
  } catch (error) {
    logger.error(`Error toggling auto-sell: ${error.message}`);
    ctx.answerCbQuery(
      "An error occurred while toggling auto-sell. Please try again."
    );
  }
});

bot.hears("💼 My Portfolio", async (ctx) => {
  try {
    const wallets = await Wallet.find({ userId: ctx.from.id.toString() });
    if (wallets.length === 0) {
      return ctx.reply("You have no wallets in your portfolio.");
    }

    let message = "Your portfolio:\n\n";
    for (let wallet of wallets) {
      const balance = await getBalance(wallet.publicKey);
      message += `Wallet ${wallet.publicKey}: ${balance} SOL\n`;
      // In a real implementation, you'd also fetch and display token balances here
    }
    ctx.reply(message);
  } catch (error) {
    logger.error(`Error fetching portfolio: ${error.message}`);
    ctx.reply(
      "An error occurred while fetching your portfolio. Please try again."
    );
  }
});

bot.hears("🔄 Copy Trading", (ctx) => {
  ctx.reply(
    "Copy Trading:\n\n" +
      "Use the following command to start copy trading:\n" +
      "/copytrade <trader_address> <max_amount_per_trade>"
  );
});

bot.command("copytrade", async (ctx) => {
  try {
    const [_, traderAddress, maxAmountPerTrade] = ctx.message.text.split(" ");
    if (!traderAddress || !maxAmountPerTrade) {
      return ctx.reply(
        "Invalid format. Use: /copytrade <trader_address> <max_amount_per_trade>"
      );
    }

    const copyTrade = new CopyTrade({
      userId: ctx.from.id.toString(),
      traderAddress: traderAddress,
      maxAmountPerTrade: parseFloat(maxAmountPerTrade),
      status: "active",
    });
    await copyTrade.save();

    ctx.reply(
      `Copy Trade set up successfully!\n\n` +
        `Trader: ${traderAddress}\n` +
        `Max Amount Per Trade: ${maxAmountPerTrade} SOL\n\n` +
        `Status: Active`
    );
  } catch (error) {
    logger.error(`Error setting up copy trade: ${error.message}`);
    ctx.reply(
      "An error occurred while setting up copy trading. Please try again."
    );
  }
});

// Implement a periodic task to execute pending orders and copy trades
setInterval(async () => {
  try {
    logger.debug("Executing pending orders and copy trades");
    const pendingOrders = await Order.find({ status: "pending" });
    for (let order of pendingOrders) {
      const wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) continue;

      if (order.type === "snipe") {
        // Implement snipe logic here
        // This is a placeholder implementation
        const result = await buyToken(wallet, order.tokenAddress, order.amount);
        order.status = "completed";
        await order.save();

        // Notify user
        bot.telegram.sendMessage(
          order.userId,
          `Snipe order executed: ${result}`
        );
      }
    }

    // Implement copy trading logic here
    const activeCopyTrades = await CopyTrade.find({ status: "active" });
    for (let copyTrade of activeCopyTrades) {
      // Monitor trader's actions and execute trades accordingly
      // This is a placeholder and should be replaced with actual implementation
      logger.debug(`Monitoring trades for ${copyTrade.traderAddress}`);
    }
  } catch (error) {
    logger.error(
      `Error executing pending orders and copy trades: ${error.message}`
    );
  }
}, 60000); // Check every minute

// Error handling
bot.catch((err, ctx) => {
  logger.error(`Unexpected error for ${ctx.updateType}`, err);
  ctx.reply("An unexpected error occurred. Our team has been notified.");
});

// Start the bot
bot.launch().then(() => {
  logger.info("Bot is running...");
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
