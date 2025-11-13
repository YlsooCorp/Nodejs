// index.js
import express from "express";
import dotenv from "dotenv";
import session from "express-session";
import { supabase } from "./supabase/client.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// --- Resolve paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// ⚙️  EXPRESS + EJS SETUP
// ==========================================

// When running behind a proxy (Cloudflare / Sevalla), this is important
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // ensure correct views path
app.use(express.static(path.join(__dirname, "public"))); // ensure correct static path
app.use(express.urlencoded({ extended: true }));

// 🧩 Sessions (for login persistence)
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: NODE_ENV === "production", // secure cookies only over HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// 🧠 Make user accessible in templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ==========================================
// ⚔️ KIT ICONS
// ==========================================
const kitIcons = {
  "Mace": "https://5ohxxy1roe.ucarecd.net/b826101d-1d74-4b70-86ae-1a49827efede/Mace.png",
  "Vanilla (Crystals)": "https://5ohxxy1roe.ucarecd.net/250f0953-d9d7-4e2f-885a-c4a76b8538a8/End_Crystal.png",
  "Sword": "https://5ohxxy1roe.ucarecd.net/14265368-a900-40f1-9a42-e89afbfb319f/Diamond_Sword.png",
  "Axe": "https://5ohxxy1roe.ucarecd.net/58f80177-0f61-412c-ac8b-a37460f485c3/Diamond_Axe.png",
  "NethPOT": "https://5ohxxy1roe.ucarecd.net/81e8f12b-aade-4758-a967-772eaf071a77/Splash_Potion_Invisibility.png",
  "SMP": "https://5ohxxy1roe.ucarecd.net/49a2a01c-46e7-4dd4-813b-91428cb86028/Cobweb.png",
  "Lifesteal": "https://5ohxxy1roe.ucarecd.net/a25a160e-09b9-4540-89e7-9b6f75bd8859/Hardcore_Heart_Full.png",
  "CartPVP": "https://5ohxxy1roe.ucarecd.net/89646374-78ad-4b75-acd3-ed06318ceecd/Tnt_Minecart.png",
  "UHC": "https://5ohxxy1roe.ucarecd.net/f1833283-ff6b-496d-891b-fb103eb49bcf/Lava_Bucket.png",
};

const defaultIcon =
  "https://5ohxxy1roe.ucarecd.net/b826101d-1d74-4b70-86ae-1a49827efede/Mace.png"; // fallback

// ==========================================
// 👤 USER AUTH ROUTES
// ==========================================

// Register
app.get("/register", (req, res) => res.render("register", { error: null }));
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return res.render("register", { error: error.message });
  res.redirect("/login");
});

// Login
app.get("/login", (req, res) => res.render("login", { error: null }));
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return res.render("login", { error: error.message });

  req.session.user = data.user;
  res.redirect("/dashboard");
});

// Dashboard (protected)
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("dashboard", { user: req.session.user });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ==========================================
// 🧠 PLAYER + LEADERBOARD ROUTES
// ==========================================

// Player profile
app.get("/player/:username", async (req, res) => {
  const username = req.params.username;

  const { data: pkData, error } = await supabase
    .from("player_kits")
    .select(
      `
      tier_code,
      points,
      kits(name),
      players(username)
    `
    )
    .eq("players.username", username)
    .order("points", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).send("Error loading player: " + error.message);
  }

  if (!pkData || pkData.length === 0) {
    return res.status(404).send("Player not found");
  }

  const player = {
    username,
    totalPoints: pkData.reduce((sum, p) => sum + p.points, 0),
    kits: pkData.map((row) => ({
      name: row.kits.name,
      tier_code: row.tier_code,
      points: row.points,
      icon: kitIcons[row.kits.name] || defaultIcon,
    })),
  };

  res.render("player", { player });
});

// Search
app.get("/search", async (req, res) => {
  const username = req.query.username?.trim();
  if (!username) return res.redirect("/");

  const { data: playerData, error } = await supabase
    .from("players")
    .select("username")
    .ilike("username", username);

  if (error) {
    console.error(error);
    return res.status(500).send("Database error.");
  }

  if (playerData && playerData.length > 0) {
    res.redirect(`/player/${playerData[0].username}`);
  } else {
    res.render("search-not-found", { username });
  }
});

// ==========================================
// 📜 Legal Pages
// ==========================================
app.get("/privacy", (req, res) => {
  res.render("privacy");
});

app.get("/terms", (req, res) => {
  res.render("terms");
});

// Leaderboard
app.get("/", async (req, res) => {
  const { data: pkData, error } = await supabase
    .from("player_kits")
    .select(
      `
      player_id,
      tier_code,
      points,
      kits(name),
      players(username)
    `
    )
    .order("points", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).send("Database error: " + error.message);
  }

  const leaderboard = {};

  pkData.forEach((row) => {
    const uname = row.players.username;
    if (!leaderboard[uname]) {
      leaderboard[uname] = { username: uname, totalPoints: 0, kits: [] };
    }
    leaderboard[uname].kits.push({
      name: row.kits.name,
      tier_code: row.tier_code,
      points: row.points,
      icon: kitIcons[row.kits.name] || defaultIcon,
    });
    leaderboard[uname].totalPoints += row.points;
  });

  const sorted = Object.values(leaderboard)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 100);

  res.render("index", { players: sorted });
});

// ==========================================
// 🧾 SERVER START + DISCORD BOT AUTOSTART
// ==========================================
const server = app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT} (NODE_ENV=${NODE_ENV})`);
});

// --- Auto-start Discord bot ---
// NOTE: On Sevalla, make sure you run only ONE replica of this app
// if the bot should only be running once.
const botPath = path.join(__dirname, "bot.js");
console.log("🤖 Launching Discord bot...");

const botProcess = spawn("node", [botPath], {
  cwd: __dirname,
  stdio: "inherit",
  env: process.env,
});

botProcess.on("exit", (code, signal) => {
  console.log(`⚠️ Bot process exited (${signal || code})`);
});

// --- Graceful shutdown ---
function shutdown() {
  console.log("\n🛑 Shutting down...");
  server.close(() => {
    console.log("🌐 Express server closed.");
    if (botProcess && !botProcess.killed) {
      botProcess.kill("SIGINT");
      console.log("🤖 Discord bot process terminated.");
    }
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);