require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const { Token, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const bs58 = require("bs58");
const axios = require("axios");
const pino = require("pino");
const mongoose = require("mongoose");

// Set up logger
const logger = pino({ level: "debug" });

// Solana connection
const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// Telegram bot setup
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Database setup
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", function () {
  logger.info("Connected to MongoDB");
});

// Schemas
const WalletSchema = new mongoose.Schema({
  userId: String,
  publicKey: String,
  privateKey: String,
});

const OrderSchema = new mongoose.Schema({
  userId: String,
  type: String,
  tokenAddress: String,
  amount: Number,
  status: String,
});

const UserSchema = new mongoose.Schema({
  userId: String,
  referralCode: String,
  referredBy: String,
  settings: {
    slippage: Number,
    autoBuy: Boolean,
    autoSell: Boolean,
  },
});

const SnipeSchema = new mongoose.Schema({
  userId: String,
  walletAddress: String,
  tokenAddress: String,
  amountInSol: Number,
  maxPrice: Number,
  status: String,
  createdAt: { type: Date, default: Date.now },
});

const CopyTradeSchema = new mongoose.Schema({
  userId: String,
  traderAddress: String,
  maxAmountPerTrade: Number,
  status: String,
  createdAt: { type: Date, default: Date.now },
});

const Snipe = mongoose.model("Snipe", SnipeSchema);
const CopyTrade = mongoose.model("CopyTrade", CopyTradeSchema);
const Wallet = mongoose.model("Wallet", WalletSchema);
const Order = mongoose.model("Order", OrderSchema);
const User = mongoose.model("User", UserSchema);

// Helper functions
async function getBalance(publicKey) {
  try {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    logger.error(`Failed to get balance: ${error.message}`);
    throw error;
  }
}

async function getFirstWallet(userId) {
  try {
    const wallet = await Wallet.findOne({ userId: userId });
    if (wallet && PublicKey.isOnCurve(wallet.publicKey)) {
      return wallet.publicKey;
    } else {
      throw new Error("Invalid wallet public key");
    }
  } catch (error) {
    logger.error(`Failed to get first wallet: ${error.message}`);
    throw error;
  }
}

async function getSolPrice() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    return response.data.solana.usd;
  } catch (error) {
    logger.error(`Failed to get SOL price: ${error.message}`);
    return "N/A";
  }
}

async function getTokenInfo(tokenAddress) {
  try {
    const response = await axios.get(
      `https://api.raydium.io/v2/main/token/${tokenAddress}`
    );
    return response.data;
  } catch (error) {
    logger.error(`Failed to get token info: ${error.message}`);
    throw error;
  }
}

async function buyToken(wallet, tokenAddress, amountInSol) {
  try {
    // This is a placeholder. In a real implementation, you'd interact with a DEX like Raydium
    logger.debug(`Buying ${amountInSol} SOL worth of token ${tokenAddress}`);
    // Implement actual buy logic here
    return "Transaction successful"; // Return transaction ID in real implementation
  } catch (error) {
    logger.error(`Failed to buy token: ${error.message}`);
    throw error;
  }
}

async function sellToken(wallet, tokenAddress, amountOfTokens) {
  try {
    // This is a placeholder. In a real implementation, you'd interact with a DEX like Raydium
    logger.debug(`Selling ${amountOfTokens} of token ${tokenAddress}`);
    // Implement actual sell logic here
    return "Transaction successful"; // Return transaction ID in real implementation
  } catch (error) {
    logger.error(`Failed to sell token: ${error.message}`);
    throw error;
  }
}

// Bot commands
bot.command("start", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} started the bot`);
    let user = await User.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
      user = new User({
        userId: ctx.from.id.toString(),
        referralCode: Math.random().toString(36).substring(7),
        settings: { slippage: 0.5, autoBuy: false, autoSell: false },
      });
      await user.save();
    }

    const solPrice = await getSolPrice();
    const walletAddress = await getFirstWallet(user.userId);
    const walletBalance = await getBalance(walletAddress);

    ctx.reply(
      `🚀 SolDxBot: Your Gateway to Solana DeFi 🤖\n\n` +
        `💎 SOL: $${solPrice}\n\n` +
        `Your First Wallet\n` +
        `💠 ${walletAddress}\n` +
        `💠 Balance: ${walletBalance} SOL\n\n`,
      Markup.keyboard([
        ['💎 Token Info', '💰 Buy/Sell Token'],
        ['🎯 Token Sniper', '🏆 Ranking'],
        ['👥 Referral', '⚙️ Settings'],
        ['💼 My Portfolio', '🔄 Copy Trading']
      ]).resize()
    );
  } catch (error) {
    logger.error(`Error in start command: ${error.message}`);
    ctx.reply("An error occurred. Please try again later.");
  }
});

bot.hears('💎 Token Info', (ctx) => {
  ctx.reply("Please enter the token contract address:");
  bot.on('text', async (ctx) => {
    try {
      const tokenAddress = ctx.message.text;
      const tokenInfo = await getTokenInfo(tokenAddress);
      ctx.reply(
        `Token Information:\n\n` +
        `Name: ${tokenInfo.name}\n` +
        `Symbol: ${tokenInfo.symbol}\n` +
        `Price: $${tokenInfo.price}\n` +
        `Market Cap: $${tokenInfo.marketCap.toLocaleString()}\n` +
        `24h Change: ${tokenInfo.priceChange24h}%\n` +
        `24h Volume: $${tokenInfo.volume24h.toLocaleString()}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Buy 50%', `buy_50_${tokenAddress}`)],
          [Markup.button.callback('Buy 100%', `buy_100_${tokenAddress}`)],
          [Markup.button.callback('Custom Amount', `buy_custom_${tokenAddress}`)]
        ])
      );
    } catch (error) {
      ctx.reply("Error fetching token information. Please try again.");
    }
  });
});

bot.action(/buy_(\d+)_(.+)/, async (ctx) => {
  const percentage = parseInt(ctx.match[1]);
  const tokenAddress = ctx.match[2];
  const wallet = await getFirstWallet(ctx.from.id.toString());
  const balance = await getBalance(wallet);
  const amountInSol = (balance * percentage) / 100;

  try {
    const result = await buyToken(wallet, tokenAddress, amountInSol);
    ctx.answerCbQuery(`Bought ${amountInSol} SOL worth of tokens. ${result}`);
  } catch (error) {
    ctx.answerCbQuery("Error executing buy order. Please try again.");
  }
});

bot.action(/buy_custom_(.+)/, (ctx) => {
  const tokenAddress = ctx.match[1];
  ctx.reply("Enter the amount of SOL you want to spend:");
  bot.on('text', async (ctx) => {
    const amountInSol = parseFloat(ctx.message.text);
    if (isNaN(amountInSol)) {
      return ctx.reply("Invalid amount. Please enter a number.");
    }
    const wallet = await getFirstWallet(ctx.from.id.toString());
    try {
      const result = await buyToken(wallet, tokenAddress, amountInSol);
      ctx.reply(`Bought ${amountInSol} SOL worth of tokens. ${result}`);
    } catch (error) {
      ctx.reply("Error executing buy order. Please try again.");
    }
  });
});

bot.hears('💰 Buy/Sell Token', (ctx) => {
  ctx.reply(
    "Choose an action:",
    Markup.inlineKeyboard([
      [Markup.button.callback('Buy Token', 'buy_token')],
      [Markup.button.callback('Sell Token', 'sell_token')]
    ])
  );
});

bot.action('buy_token', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Enter the token address and amount in SOL (e.g., ADDRESS 1.5):");
  bot.on('text', async (ctx) => {
    const [tokenAddress, amount] = ctx.message.text.split(' ');
    if (!tokenAddress || !amount) {
      return ctx.reply("Invalid format. Please use: ADDRESS AMOUNT");
    }
    const wallet = await getFirstWallet(ctx.from.id.toString());
    try {
      const result = await buyToken(wallet, tokenAddress, parseFloat(amount));
      ctx.reply(`Buy order executed: ${result}`);
    } catch (error) {
      ctx.reply("Error executing buy order. Please try again.");
    }
  });
});

bot.action('sell_token', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Enter the token address and amount of tokens (e.g., ADDRESS 100):");
  bot.on('text', async (ctx) => {
    const [tokenAddress, amount] = ctx.message.text.split(' ');
    if (!tokenAddress || !amount) {
      return ctx.reply("Invalid format. Please use: ADDRESS AMOUNT");
    }
    const wallet = await getFirstWallet(ctx.from.id.toString());
    try {
      const result = await sellToken(wallet, tokenAddress, parseFloat(amount));
      ctx.reply(`Sell order executed: ${result}`);
    } catch (error) {
      ctx.reply("Error executing sell order. Please try again.");
    }
  });
});

bot.hears('🎯 Token Sniper', (ctx) => {
  ctx.reply(
    "Token Sniper Settings:\n\n" +
    "Use the following command to set up a snipe:\n" +
    "/snipe <token_address> <amount_in_sol> <max_price>"
  );
});

bot.command('snipe', async (ctx) => {
  try {
    const [_, tokenAddress, amountInSol, maxPrice] = ctx.message.text.split(' ');
    if (!tokenAddress || !amountInSol || !maxPrice) {
      return ctx.reply("Invalid format. Use: /snipe <token_address> <amount_in_sol> <max_price>");
    }

    const wallet = await getFirstWallet(ctx.from.id.toString());
    const snipe = new Snipe({
      userId: ctx.from.id.toString(),
      walletAddress: wallet,
      tokenAddress: tokenAddress,
      amountInSol: parseFloat(amountInSol),
      maxPrice: parseFloat(maxPrice),
      status: "pending",
    });
    await snipe.save();

    ctx.reply(
      `Snipe order set up successfully!\n\n` +
      `Token: ${tokenAddress}\n` +
      `Amount: ${amountInSol} SOL\n` +
      `Max Price: $${maxPrice}\n\n` +
      `Status: Pending`
    );
  } catch (error) {
    logger.error(`Error setting up snipe: ${error.message}`);
    ctx.reply("An error occurred while setting up the snipe. Please try again.");
  }
});

bot.hears('🏆 Ranking', async (ctx) => {
  try {
    const topUsers = await User.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "referralCode",
          foreignField: "referredBy",
          as: "referrals",
        },
      },
      {
        $project: {
          userId: 1,
          referralCount: { $size: "$referrals" },
        },
      },
      { $sort: { referralCount: -1 } },
      { $limit: 10 },
    ]);

    let message = "Top 10 Users by Referrals:\n\n";
    topUsers.forEach((user, index) => {
      message += `${index + 1}. User ${user.userId}: ${user.referralCount} referrals\n`;
    });

    ctx.reply(message);
  } catch (error) {
    logger.error(`Error accessing ranking system: ${error.message}`);
    ctx.reply("An error occurred while accessing the ranking system. Please try again.");
  }
});

bot.hears('👥 Referral', async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
      return ctx.reply("User not found. Please start the bot again.");
    }

    const referredUsers = await User.countDocuments({ referredBy: user.referralCode });

    ctx.reply(
      `Your referral code is: ${user.referralCode}\n` +
      `You have referred ${referredUsers} users.\n\n` +
      `Share this code with your friends to earn rewards!\n\n` +
      `To enter a referral code, use: /referral <code>`
    );
  } catch (error) {
    logger.error(`Error accessing referral system: ${error.message}`);
    ctx.reply("An error occurred while accessing the referral system. Please try again.");
  }
});

bot.command('referral', async (ctx) => {
  try {
    const [_, referralCode] = ctx.message.text.split(' ');
    if (!referralCode) {
      return ctx.reply("Please provide a referral code. Usage: /referral <code>");
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
    ctx.reply("An error occurred while applying the referral code. Please try again.");
  }
});

bot.hears('⚙️ Settings', async (ctx) => {
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
        [Markup.button.callback('Set Slippage', 'set_slippage')],
        [Markup.button.callback(`${user.settings.autoBuy ? "Disable" : "Enable"} Auto-buy`, 'toggle_auto_buy')],
        [Markup.button.callback(`${user.settings.autoSell ? "Disable" : "Enable"} Auto-sell`, 'toggle_auto_sell')]
      ])
    );
  } catch (error) {
    logger.error(`Error accessing settings: ${error.message}`);
    ctx.reply("An error occurred while accessing settings. Please try again.");
  }
});

bot.action('set_slippage', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("Enter new slippage percentage (e.g., 0.5 for 0.5%):");
  bot.on('text', async (ctx) => {
    const slippage = parseFloat(ctx.message.text);
    if (isNaN(slippage) || slippage < 0 || slippage > 100) {
      return ctx.reply("Invalid slippage. Please enter a number between 0 and 100.");
    }
    await User.updateOne(
      { userId: ctx.from.id.toString() },
      { "settings.slippage": slippage }
    );
    ctx.reply(`Slippage updated to ${slippage}%`);
  });
});

bot.action('toggle_auto_buy', async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.settings.autoBuy = !user.settings.autoBuy;
    await user.save();
    ctx.answerCbQuery(`Auto-buy is now ${user.settings.autoBuy ? "On" : "Off"}`);
  } catch (error) {
    logger.error(`Error toggling auto-buy: ${error.message}`);
    ctx.answerCbQuery("An error occurred while toggling auto-buy. Please try again.");
  }
});

bot.action('toggle_auto_sell', async (ctx) => {
  try {
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.settings.autoSell = !user.settings.autoSell;
    await user.save();
    ctx.answerCbQuery(`Auto-sell is now ${user.settings.autoSell ? "On" : "Off"}`);
  } catch (error) {
    logger.error(`Error toggling auto-sell: ${error.message}`);
    ctx.answerCbQuery("An error occurred while toggling auto-sell. Please try again.");
  }
});

bot.hears('💼 My Portfolio', async (ctx) => {
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
    ctx.reply("An error occurred while fetching your portfolio. Please try again.");
  }
});

bot.hears('🔄 Copy Trading', (ctx) => {
  ctx.reply(
    "Copy Trading:\n\n" +
    "Use the following command to start copy trading:\n" +
    "/copytrade <trader_address> <max_amount_per_trade>"
  );
});

bot.command('copytrade', async (ctx) => {
  try {
    const [_, traderAddress, maxAmountPerTrade] = ctx.message.text.split(' ');
    if (!traderAddress || !maxAmountPerTrade) {
      return ctx.reply("Invalid format. Use: /copytrade <trader_address> <max_amount_per_trade>");
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
    ctx.reply("An error occurred while setting up copy trading. Please try again.");
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
        bot.telegram.sendMessage(order.userId, `Snipe order executed: ${result}`);
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
    logger.error(`Error executing pending orders and copy trades: ${error.message}`);
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