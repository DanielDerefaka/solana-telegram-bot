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

    const solPrice = await getSolPrice(); // Implement this function to fetch SOL price
    const walletAddress = await getFirstWallet(user.userId); // Implement this function
    const walletBalance = await getBalance(walletAddress);

    ctx.reply(
      `🚀 SolDxBot: Your Gateway to Solana DeFi 🤖\n\n` +
        `Telegram | Twitter | Website\n\n` +
        `💎 SOL: $${solPrice}\n\n` +
        `Your First Wallet\n` +
        `💠 ${walletAddress}\n` +
        `💠 Balance: ${walletBalance} SOL\n\n` +
        `View on Explorer`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✨ Buy & Sell", "buy_sell"),
          Markup.button.callback("🎯 Token Sniper", "token_sniper"),
        ],
        [
          Markup.button.callback("🎯 Sniper Pumpfun", "sniper_pumpfun"),
          Markup.button.callback("🎯 Sniper Moonshot", "sniper_moonshot"),
        ],
        [
          Markup.button.callback("✍️ Limit Orders", "limit_orders"),
          Markup.button.callback("✍️ DCA Orders", "dca_orders"),
        ],
        [
          Markup.button.callback("👤 Profile", "profile"),
          Markup.button.callback("💳 Wallets", "wallets"),
          Markup.button.callback("🎮 Trades", "trades"),
        ],
        [
          Markup.button.callback("🎮 Copy Trades", "copy_trades"),
          Markup.button.callback("👥 Referral System", "referral_system"),
        ],
        [
          Markup.button.callback("🏆 Ranking Top Vol", "ranking"),
          Markup.button.callback("💰 Claim Top Vol", "claim_top_vol"),
        ],
        [
          Markup.button.callback("✉️ Transfer SOL", "transfer_sol"),
          Markup.button.callback("⚙️ Settings", "settings"),
        ],
      ])
    );
  } catch (error) {
    logger.error(`Error in start command: ${error.message}`);
    ctx.reply("An error occurred. Please try again later.");
  }
});

bot.hears("Generate Wallet", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} generating new wallet`);
    const wallet = Keypair.generate();
    const newWallet = new Wallet({
      userId: ctx.from.id.toString(),
      publicKey: wallet.publicKey.toBase58(),
      privateKey: bs58.default.encode(wallet.secretKey),
    });
    await newWallet.save();
    ctx.reply(
      `✅ New wallet generated:\n💠 ${wallet.publicKey.toBase58()}\n\nKeep your private key safe!`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🔍 View on Explorer",
            `explorer_${wallet.publicKey.toBase58()}`
          ),
        ],
        [Markup.button.callback("💳 My Wallets", "my_wallets")],
      ])
    );
  } catch (error) {
    logger.error(`Error generating wallet: ${error.message}`);
    ctx.reply(
      "An error occurred while generating the wallet. Please try again."
    );
  }
});

bot.hears("My Wallets", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} requesting wallet list`);
    const wallets = await Wallet.find({ userId: ctx.from.id.toString() });
    if (wallets.length === 0) {
      return ctx.reply("You have no wallets. Generate one first!");
    }

    let message = "Your wallets:\n";
    for (let wallet of wallets) {
      const balance = await getBalance(wallet.publicKey);
      message += `💠 ${wallet.publicKey} - ${balance} SOL\n`;
    }
    ctx.reply(
      message,
      Markup.inlineKeyboard([
        [Markup.button.callback("➕ Connect Wallet", "connect_wallet")],
        [Markup.button.callback("🆕 Generate New Wallet", "generate_wallet")],
      ])
    );
  } catch (error) {
    logger.error(`Error listing wallets: ${error.message}`);
    ctx.reply(
      "An error occurred while fetching your wallets. Please try again."
    );
  }
});

bot.action("main_menu", async (ctx) => {
  await ctx.answerCbQuery();
  const solPrice = await getSolPrice();
  const walletAddress = await getFirstWallet(ctx.from.id.toString());
  const walletBalance = await getBalance(walletAddress);

  ctx.editMessageText(
    `🚀 SolTradingBot: Your Gateway to Solana DeFi 🤖\n\n` +
      `Telegram | Twitter | Website\n\n` +
      `💎 SOL: $${solPrice}\n\n` +
      `Your First Wallet\n` +
      `💠 ${walletAddress}\n` +
      `💠 Balance: ${walletBalance} SOL\n\n` +
      `View on Explorer`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✨ Buy & Sell", "buy_sell"),
        Markup.button.callback("🎯 Token Sniper", "token_sniper"),
      ],
      [
        Markup.button.callback("🎯 Sniper Pumpfun", "sniper_pumpfun"),
        Markup.button.callback("🎯 Sniper Moonshot", "sniper_moonshot"),
      ],
      [
        Markup.button.callback("✍️ Limit Orders", "limit_orders"),
        Markup.button.callback("✍️ DCA Orders", "dca_orders"),
      ],
      [
        Markup.button.callback("👤 Profile", "profile"),
        Markup.button.callback("💳 Wallets", "wallets"),
        Markup.button.callback("🎮 Trades", "trades"),
      ],
      [
        Markup.button.callback("🎮 Copy Trades", "copy_trades"),
        Markup.button.callback("👥 Referral System", "referral_system"),
      ],
      [
        Markup.button.callback("🏆 Ranking Top Vol", "ranking"),
        Markup.button.callback("💰 Claim Top Vol", "claim_top_vol"),
      ],
      [
        Markup.button.callback("✉️ Transfer SOL", "transfer_sol"),
        Markup.button.callback("⚙️ Settings", "settings"),
      ],
    ])
  );
});

bot.hears("Buy Token", (ctx) => {
  logger.debug(`User ${ctx.from.id} initiated buy token process`);
  ctx.reply(
    "To buy a token, use the format: /buy <wallet_address> <token_address> <amount_in_sol>"
  );
});

bot.command("buy", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} attempting to buy token`);
    const [_, walletAddress, tokenAddress, amount] =
      ctx.message.text.split(" ");
    if (!walletAddress || !tokenAddress || !amount) {
      return ctx.reply(
        "Invalid format. Use: /buy <wallet_address> <token_address> <amount_in_sol>"
      );
    }

    const wallet = await Wallet.findOne({
      userId: ctx.from.id.toString(),
      publicKey: walletAddress,
    });
    if (!wallet) {
      return ctx.reply(
        "Wallet not found. Please use one of your generated wallets."
      );
    }

    const result = await buyToken(wallet, tokenAddress, parseFloat(amount));
    ctx.reply(`Buy order executed: ${result}`);
  } catch (error) {
    logger.error(`Error buying token: ${error.message}`);
    ctx.reply("An error occurred while buying the token. Please try again.");
  }
});

bot.hears("Sell Token", (ctx) => {
  logger.debug(`User ${ctx.from.id} initiated sell token process`);
  ctx.reply(
    "To sell a token, use the format: /sell <wallet_address> <token_address> <amount_of_tokens>"
  );
});

bot.action("copy_trades", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🎮 Copy Trades\n\nCopy trades from successful traders automatically!\n\nUse the following command to start copy trading:\n/copytrade <trader_address> <max_amount_per_trade>",
      Markup.inlineKeyboard([
        [Markup.button.callback("🏆 Top Traders", "top_traders")],
        [Markup.button.callback("📊 My Copy Trades", "my_copy_trades")]
      ])
    );
  });
  
  bot.command("copytrade", async (ctx) => {
    try {
      const [_, traderAddress, maxAmountPerTrade] = ctx.message.text.split(" ");
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
  
      ctx.reply(`🎮 Copy Trade set up successfully!\n\nTrader: ${traderAddress}\nMax Amount Per Trade: ${maxAmountPerTrade} SOL\n\nStatus: Active`,
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Stop Copy Trading", `stop_copy_trade_${copyTrade._id}`)],
          [Markup.button.callback("📊 My Copy Trades", "my_copy_trades")]
        ])
      );
    } catch (error) {
      logger.error(`Error setting up copy trade: ${error.message}`);
      ctx.reply("An error occurred while setting up copy trading. Please try again.");
    }
  });

bot.command("sell", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} attempting to sell token`);
    const [_, walletAddress, tokenAddress, amount] =
      ctx.message.text.split(" ");
    if (!walletAddress || !tokenAddress || !amount) {
      return ctx.reply(
        "Invalid format. Use: /sell <wallet_address> <token_address> <amount_of_tokens>"
      );
    }

    const wallet = await Wallet.findOne({
      userId: ctx.from.id.toString(),
      publicKey: walletAddress,
    });
    if (!wallet) {
      return ctx.reply(
        "Wallet not found. Please use one of your generated wallets."
      );
    }

    const result = await sellToken(wallet, tokenAddress, parseFloat(amount));
    ctx.reply(`Sell order executed: ${result}`);
  } catch (error) {
    logger.error(`Error selling token: ${error.message}`);
    ctx.reply("An error occurred while selling the token. Please try again.");
  }
});

bot.action("token_sniper", (ctx) => {
    ctx.answerCbQuery();
    ctx.reply("🎯 Token Sniper\n\nUse the following command to set up a snipe:\n/snipe <wallet_address> <token_address> <amount_in_sol> <max_price>",
      Markup.inlineKeyboard([
        [Markup.button.callback("❓ How It Works", "sniper_help")],
        [Markup.button.callback("📊 My Snipes", "my_snipes")]
      ])
    );
  });
  
  bot.command("snipe", async (ctx) => {
    try {
      const [_, walletAddress, tokenAddress, amountInSol, maxPrice] = ctx.message.text.split(" ");
      if (!walletAddress || !tokenAddress || !amountInSol || !maxPrice) {
        return ctx.reply("Invalid format. Use: /snipe <wallet_address> <token_address> <amount_in_sol> <max_price>");
      }
  
      const wallet = await Wallet.findOne({
        userId: ctx.from.id.toString(),
        publicKey: walletAddress,
      });
      if (!wallet) {
        return ctx.reply("Wallet not found. Please use one of your generated wallets.");
      }
  
      const snipe = new Snipe({
        userId: ctx.from.id.toString(),
        walletAddress: walletAddress,
        tokenAddress: tokenAddress,
        amountInSol: parseFloat(amountInSol),
        maxPrice: parseFloat(maxPrice),
        status: "pending",
      });
      await snipe.save();
  
      ctx.reply(`🎯 Snipe order set up successfully!\n\nToken: ${tokenAddress}\nAmount: ${amountInSol} SOL\nMax Price: $${maxPrice}\n\nStatus: Pending`,
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Cancel Snipe", `cancel_snipe_${snipe._id}`)],
          [Markup.button.callback("📊 My Snipes", "my_snipes")]
        ])
      );
    } catch (error) {
      logger.error(`Error setting up snipe: ${error.message}`);
      ctx.reply("An error occurred while setting up the snipe. Please try again.");
    }
  });

async function getTokenDetails(tokenAddress) {
  try {
    const response = await axios.get(
      `https://api.raydium.io/v2/main/token/${tokenAddress}`
    );
    const data = response.data;
    return `
  Token Details:
  Name: ${data.name}
  Symbol: ${data.symbol}
  Market Cap: $${data.marketCap.toLocaleString()}
  Price: $${data.price}
  24h Change: ${data.priceChange24h}%
      `;
  } catch (error) {
    logger.error(`Failed to get token details: ${error.message}`);
    throw error;
  }
}

bot.command("tokeninfo", async (ctx) => {
  const tokenAddress = ctx.message.text.split(" ")[1];
  if (!tokenAddress) {
    return ctx.reply(
      "Please provide a token address. Usage: /tokeninfo <token_address>"
    );
  }
  try {
    const tokenDetails = await getTokenDetails(tokenAddress);
    ctx.reply(tokenDetails);
  } catch (error) {
    ctx.reply(
      "An error occurred while fetching token details. Please try again."
    );
  }
});

bot.command("snipe", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} setting up token snipe`);
    const [_, walletAddress, tokenAddress, amount] =
      ctx.message.text.split(" ");
    if (!walletAddress || !tokenAddress || !amount) {
      return ctx.reply(
        "Invalid format. Use: /snipe <wallet_address> <token_address> <amount_in_sol>"
      );
    }

    const wallet = await Wallet.findOne({
      userId: ctx.from.id.toString(),
      publicKey: walletAddress,
    });
    if (!wallet) {
      return ctx.reply(
        "Wallet not found. Please use one of your generated wallets."
      );
    }

    const order = new Order({
      userId: ctx.from.id.toString(),
      type: "snipe",
      tokenAddress: tokenAddress,
      amount: parseFloat(amount),
      status: "pending",
    });
    await order.save();

    ctx.reply(`Snipe order set up for ${amount} SOL on token ${tokenAddress}`);
  } catch (error) {
    logger.error(`Error setting up snipe: ${error.message}`);
    ctx.reply(
      "An error occurred while setting up the snipe. Please try again."
    );
  }
});

bot.hears("My Orders", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} checking orders`);
    const orders = await Order.find({ userId: ctx.from.id.toString() });
    if (orders.length === 0) {
      return ctx.reply("You have no active orders.");
    }

    let message = "Your active orders:\n";
    orders.forEach((order, index) => {
      message += `${index + 1}. ${order.type} ${order.amount} of ${
        order.tokenAddress
      } (Status: ${order.status})\n`;
    });
    ctx.reply(message);
  } catch (error) {
    logger.error(`Error fetching orders: ${error.message}`);
    ctx.reply(
      "An error occurred while fetching your orders. Please try again."
    );
  }
});

bot.hears("My Portfolio", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} checking portfolio`);
    const wallets = await Wallet.find({ userId: ctx.from.id.toString() });
    if (wallets.length === 0) {
      return ctx.reply("You have no wallets in your portfolio.");
    }

    let message = "Your portfolio:\n";
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

bot.action("settings", async (ctx) => {
    try {
      const user = await User.findOne({ userId: ctx.from.id.toString() });
      if (!user) {
        return ctx.reply("User not found. Please start the bot again.");
      }
  
      ctx.reply(`⚙️ Settings\n\nSlippage: ${user.settings.slippage}%\nAuto-buy: ${user.settings.autoBuy ? "On" : "Off"}\nAuto-sell: ${user.settings.autoSell ? "On" : "Off"}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🔢 Set Slippage", "set_slippage")],
          [Markup.button.callback(`${user.settings.autoBuy ? "🔴" : "🟢"} Auto-buy`, "toggle_auto_buy")],
          [Markup.button.callback(`${user.settings.autoSell ? "🔴" : "🟢"} Auto-sell`, "toggle_auto_sell")],
          [Markup.button.callback("🔙 Back to Menu", "main_menu")]
        ])
      );
    } catch (error) {
      logger.error(`Error accessing settings: ${error.message}`);
      ctx.reply("An error occurred while accessing settings. Please try again.");
    }
  });

bot.action("set_slippage", async (ctx) => {
  try {
    await ctx.answerCbQuery();
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
  } catch (error) {
    logger.error(`Error setting slippage: ${error.message}`);
    ctx.reply("An error occurred while setting slippage. Please try again.");
  }
});

bot.action("toggle_auto_buy", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.settings.autoBuy = !user.settings.autoBuy;
    await user.save();
    ctx.reply(`Auto-buy is now ${user.settings.autoBuy ? "On" : "Off"}`);
  } catch (error) {
    logger.error(`Error toggling auto-buy: ${error.message}`);
    ctx.reply("An error occurred while toggling auto-buy. Please try again.");
  }
});

bot.action("toggle_auto_sell", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    user.settings.autoSell = !user.settings.autoSell;
    await user.save();
    ctx.reply(`Auto-sell is now ${user.settings.autoSell ? "On" : "Off"}`);
  } catch (error) {
    logger.error(`Error toggling auto-sell: ${error.message}`);
    ctx.reply("An error occurred while toggling auto-sell. Please try again.");
  }
});

bot.hears("Referral", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} accessed referral system`);
    const user = await User.findOne({ userId: ctx.from.id.toString() });
    if (!user) {
      return ctx.reply("User not found. Please start the bot again.");
    }

    const referredUsers = await User.countDocuments({
      referredBy: user.referralCode,
    });

    ctx.reply(`Your referral code is: ${user.referralCode}
  You have referred ${referredUsers} users.
  Share this code with your friends to earn rewards!
  
  To enter a referral code, use: /referral <code>`);
  } catch (error) {
    logger.error(`Error accessing referral system: ${error.message}`);
    ctx.reply(
      "An error occurred while accessing the referral system. Please try again."
    );
  }
});

bot.command("referral", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} entering referral code`);
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

bot.hears("Ranking", async (ctx) => {
  try {
    logger.debug(`User ${ctx.from.id} accessed ranking system`);
    // This is a simplified ranking based on the number of referrals
    // In a real system, you might want to consider trading volume, account balance, etc.
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

    let message = "Top 10 Users by Referrals:\n";
    topUsers.forEach((user, index) => {
      message += `${index + 1}. User ${user.userId}: ${
        user.referralCount
      } referrals\n`;
    });

    ctx.reply(message);
  } catch (error) {
    logger.error(`Error accessing ranking system: ${error.message}`);
    ctx.reply(
      "An error occurred while accessing the ranking system. Please try again."
    );
  }
});

// Implement a periodic task to execute pending orders
setInterval(async () => {
  try {
    logger.debug("Executing pending orders");
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
  } catch (error) {
    logger.error(`Error executing pending orders: ${error.message}`);
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
