import express from "express";
import dotenv from "dotenv";
import session from "express-session";
import { supabase } from "./supabase/client.js";
import "./bot.js"; // Automatically start the Discord bot

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// ⚙️ Setup
// ===============================
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // set true in production with HTTPS
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ===============================
// 🧱 Kit Icons (Cloud URLs)
// ===============================
const kitIcons = {
  "Mace": "https://5ohxxy1roe.ucarecd.net/b826101d-1d74-4b70-86ae-1a49827efede/Mace.png",
  "Vanilla": "https://5ohxxy1roe.ucarecd.net/250f0953-d9d7-4e2f-885a-c4a76b8538a8/End_Crystal.png",
  "Sword": "https://5ohxxy1roe.ucarecd.net/14265368-a900-40f1-9a42-e89afbfb319f/Diamond_Sword.png",
  "Axe": "https://5ohxxy1roe.ucarecd.net/58f80177-0f61-412c-ac8b-a37460f485c3/Diamond_Axe.png",
  "NethPOT": "https://5ohxxy1roe.ucarecd.net/81e8f12b-aade-4758-a967-772eaf071a77/Splash_Potion_Invisibility.png",
  "SMP": "https://5ohxxy1roe.ucarecd.net/49a2a01c-46e7-4dd4-813b-91428cb86028/Cobweb.png",
  "Lifesteal": "https://5ohxxy1roe.ucarecd.net/a25a160e-09b9-4540-89e7-9b6f75bd8859/Hardcore_Heart_Full.png",
  "CartPVP": "https://5ohxxy1roe.ucarecd.net/89646374-78ad-4b75-acd3-ed06318ceecd/Tnt_Minecart.png",
  "UHC": "https://5ohxxy1roe.ucarecd.net/f1833283-ff6b-496d-891b-fb103eb49bcf/Lava_Bucket.png",
};
const defaultIcon = "https://cdn.example.com/icons/default.png";

// ===============================
// 👤 User Auth Routes
// ===============================
app.get("/register", (req, res) => res.render("register"));
app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return res.render("register", { error: error.message });
  res.redirect("/login");
});

app.get("/login", (req, res) => res.render("login"));
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.render("login", { error: error.message });

  req.session.user = data.user;
  res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("dashboard", { user: req.session.user });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ===============================
// 🧠 Player Profile Route
// ===============================
app.get("/player/:username", async (req, res) => {
  const username = req.params.username;

  const { data: playerKits, error } = await supabase
    .from("player_kits")
    .select(`
      id,
      tier_code,
      points,
      kits!inner(name),
      players!inner(username)
    `)
    .eq("players.username", username)
    .order("points", { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).send("Error loading player: " + error.message);
  }

  if (!playerKits || playerKits.length === 0) {
    return res.status(404).render("search-not-found", { username });
  }

  // 🧠 Filter out duplicates (some joins can cause repetition)
  const uniqueKits = [];
  const seen = new Set();
  for (const row of playerKits) {
    const key = row.kits.name + row.tier_code;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueKits.push(row);
    }
  }

  const player = {
    username,
    totalPoints: uniqueKits.reduce((sum, p) => sum + (p.points || 0), 0),
    kits: uniqueKits.map(row => ({
      name: row.kits.name,
      tier_code: row.tier_code,
      points: row.points,
      icon: kitIcons[row.kits.name] || defaultIcon,
    })),
  };

  res.render("player", { player });
});


// ===============================
// 🔍 Search
// ===============================
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

// ===============================
// 🏆 Leaderboard
// ===============================
app.get("/", async (req, res) => {
  const { data: pkData, error } = await supabase
    .from("player_kits")
    .select(`
      player_id,
      tier_code,
      points,
      kits(name),
      players(username)
    `)
    .order("points", { ascending: false });

  if (error) {
    console.error(error);
    return res.send("Database error: " + error.message);
  }

  const leaderboard = {};
  pkData.forEach(row => {
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

// ===============================
// 📜 Legal Pages
// ===============================
app.get("/privacy", (req, res) => res.render("privacy"));
app.get("/terms", (req, res) => res.render("terms"));

// ===============================
// ✅ Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`✅ Website running on http://localhost:${PORT}`);
});
