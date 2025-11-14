import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  InteractionType,
} from "discord.js";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

dotenv.config();

// 🧠 Track bot start time (for uptime command)
const botStartTime = Date.now();

// 🧩 Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 🧠 Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

// ============================================
// 📁 Setup link storage
// ============================================
const linksDir = path.resolve("data");
const linksPath = path.join(linksDir, "links.json");

// Ensure directory exists
if (!fs.existsSync(linksDir)) {
  fs.mkdirSync(linksDir, { recursive: true });
}

// Load links
function loadLinks() {
  if (!fs.existsSync(linksPath)) {
    fs.writeFileSync(linksPath, JSON.stringify({}, null, 2));
  }
  const raw = fs.readFileSync(linksPath, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

// Save links
function saveLinks(data) {
  fs.writeFileSync(linksPath, JSON.stringify(data, null, 2));
}

// Skin head helper
function getSkinHeadUrl(username) {
  return `https://crafatar.com/avatars/${encodeURIComponent(username)}?size=128&overlay`;
}

// ============================================
// 🧱 Slash commands
// ============================================
const commands = [
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Post the join queue embed (admin only)."),

  new SlashCommandBuilder()
    .setName("add-tier")
    .setDescription("Add or update a player's tier, kit, and points.")
    .addStringOption(opt => opt.setName("username").setDescription("Minecraft username").setRequired(true))
    .addStringOption(opt => opt.setName("kit").setDescription("Kit name (e.g., Sword)").setRequired(true))
    .addStringOption(opt => opt.setName("tier").setDescription("Tier code (e.g., HT1)").setRequired(true))
    .addIntegerOption(opt => opt.setName("points").setDescription("Points").setRequired(true)),

  new SlashCommandBuilder()
    .setName("link-mc")
    .setDescription("Link your Discord account to your Minecraft username.")
    .addStringOption(opt => opt.setName("username").setDescription("Minecraft username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("whois")
    .setDescription("Look up a linked Minecraft or Discord account.")
    .addUserOption(opt => opt.setName("user").setDescription("Discord user").setRequired(false))
    .addStringOption(opt => opt.setName("username").setDescription("Minecraft username").setRequired(false)),

  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Shows the bot's uptime."),
];

// ============================================
// 🟢 Register commands + set presence
// ============================================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: "ranktiers.com" }],
    status: "online",
  });

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.commands.set(commands);
  console.log("✅ Slash commands registered & status set.");
});

// ============================================
// 🔗 /link-mc
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "link-mc") return;

  const username = interaction.options.getString("username");
  const discordId = interaction.user.id;

  let links = loadLinks();

  for (const mcName in links) {
    if (links[mcName] === discordId) {
      return interaction.reply({
        content: `❌ You already linked your account to **${mcName}**.`,
        flags: 64,
      });
    }
  }

  if (links[username]) {
    return interaction.reply({
      content: `❌ **${username}** is already linked to another user.`,
      flags: 64,
    });
  }

  links[username] = discordId;
  saveLinks(links);

  return interaction.reply(`✅ Linked **${username}** to your Discord account!`);
});

// ============================================
// 🔍 /whois
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "whois") return;

  const targetUser = interaction.options.getUser("user");
  const mcName = interaction.options.getString("username");
  const links = loadLinks();

  if (!targetUser && !mcName) {
    return interaction.reply({ content: "❌ Provide a Discord user or an MC username.", flags: 64 });
  }

  // Lookup MC name → Discord user
  if (mcName) {
    const linkedId = links[mcName];
    if (!linkedId) {
      return interaction.reply({ content: `❌ No user linked to **${mcName}**.`, flags: 64 });
    }

    const user = await client.users.fetch(linkedId).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle("🔍 Whois Lookup")
      .addFields(
        { name: "Minecraft", value: mcName },
        { name: "Discord", value: user ? `${user.tag} (<@${user.id}>)` : "Unknown user" }
      )
      .setThumbnail(getSkinHeadUrl(mcName))
      .setColor(0x5865f2);

    return interaction.reply({ embeds: [embed] });
  }

  // Lookup Discord user → MC username
  const entry = Object.entries(links).find(([_, id]) => id === targetUser.id);
  if (!entry) {
    return interaction.reply({ content: `❌ ${targetUser} has no linked account.`, flags: 64 });
  }

  const username = entry[0];

  const embed = new EmbedBuilder()
    .setTitle("🔍 Whois Lookup")
    .addFields(
      { name: "Discord", value: `${targetUser.tag} (<@${targetUser.id}>)` },
      { name: "Minecraft", value: username }
    )
    .setThumbnail(getSkinHeadUrl(username))
    .setColor(0x5865f2);

  return interaction.reply({ embeds: [embed] });
});

// ============================================
// 🕒 /uptime
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "uptime") return;

  const ms = Date.now() - botStartTime;

  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const embed = new EmbedBuilder()
    .setTitle("⏳ Bot Uptime")
    .addFields(
      { name: "Uptime", value: `${days}d ${hours}h ${minutes}m ${seconds}s` },
      { name: "Started", value: `<t:${Math.floor(botStartTime / 1000)}:R>` }
    )
    .setColor(0x00aaff);

  return interaction.reply({ embeds: [embed] });
});

// ============================================
// 🧱 /queue
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "queue") return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Admin only.", flags: 64 });
  }

  const embed = new EmbedBuilder()
    .setTitle("🧩 Testing Queue Signup")
    .setDescription("Click below to join the testing queue.\nYou'll be asked for your MC details.")
    .setColor(0x2f3136);

  const joinButton = new ButtonBuilder()
    .setCustomId("join_queue")
    .setLabel("Join Queue")
    .setStyle(ButtonStyle.Primary);

  return interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(joinButton)],
  });
});

// ============================================
// 🔘 Button → open modal
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton() || interaction.customId !== "join_queue") return;

  const modal = new ModalBuilder()
    .setCustomId("queue_modal")
    .setTitle("Join Testing Queue");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("username")
        .setLabel("Minecraft Username")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("server")
        .setLabel("Minecraft Server")
        .setPlaceholder("Example: hypixel.net or oaksmc.xyz")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Region (EU, NA, ASIA)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("kit")
        .setLabel("Kit (Sword, Axe, Lifesteal)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  return interaction.showModal(modal);
});

// ============================================
// 🧱 /add-tier (with embed + reactions)
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "add-tier") return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Admin only.", flags: 64 });
  }

  const username = interaction.options.getString("username");
  const kit = interaction.options.getString("kit");
  const tier = interaction.options.getString("tier");
  const points = interaction.options.getInteger("points");

  // Supabase logic…
  let { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("username", username)
    .single();

  let playerId = playerData?.id;

  if (!playerId) {
    const { data, error } = await supabase
      .from("players")
      .insert({ username })
      .select()
      .single();

    if (error) return interaction.reply({ content: "❌ Failed to create player.", flags: 64 });
    playerId = data.id;
  }

  const { data: kitData, error: kitErr } = await supabase
    .from("kits")
    .select("id")
    .eq("name", kit)
    .single();

  if (!kitData) {
    return interaction.reply({ content: `❌ Kit **${kit}** not found.`, flags: 64 });
  }

  const { data: existing } = await supabase
    .from("player_kits")
    .select("id")
    .eq("player_id", playerId)
    .eq("kit_id", kitData.id)
    .single();

  if (existing) {
    await supabase
      .from("player_kits")
      .update({ tier_code: tier, points })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("player_kits")
      .insert({ player_id: playerId, kit_id: kitData.id, tier_code: tier, points });
  }

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle(`🧱 Tier Updated: ${username}`)
    .setThumbnail(getSkinHeadUrl(username))
    .addFields(
      { name: "Username", value: username, inline: true },
      { name: "Kit", value: kit, inline: true },
      { name: "Tier", value: tier, inline: true },
      { name: "Points", value: points.toString(), inline: true }
    )
    .setColor(0x00ff00)
    .setTimestamp();

  const message = await interaction.reply({
    content: `✅ Updated **${username}** → **${kit} ${tier} (${points} pts)**`,
    embeds: [embed],
    fetchReply: true,
  });

  await message.react("✅");
  await message.react("❌");
});

// ============================================
// 🚀 Start bot
// ============================================
client.login(process.env.DISCORD_TOKEN);