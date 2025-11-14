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

// Track uptime
const botStartTime = Date.now();

// Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

// ============================================
// 📁 Link storage
// ============================================
const linksDir = path.resolve("data");
const linksPath = path.join(linksDir, "links.json");

if (!fs.existsSync(linksDir)) fs.mkdirSync(linksDir, { recursive: true });

function loadLinks() {
  if (!fs.existsSync(linksPath)) fs.writeFileSync(linksPath, JSON.stringify({}, null, 2));
  return JSON.parse(fs.readFileSync(linksPath, "utf8"));
}

function saveLinks(data) {
  fs.writeFileSync(linksPath, JSON.stringify(data, null, 2));
}

function getSkinHeadUrl(username) {
  return `https://crafatar.com/avatars/${encodeURIComponent(username)}?size=128&overlay`;
}

// ============================================
// Slash commands
// ============================================
const commands = [
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Post the join queue embed (admin only)."),

  new SlashCommandBuilder()
    .setName("add-tier")
    .setDescription("Add or update a player's tier, kit, and points.")
    .addStringOption(o => o.setName("username").setDescription("Minecraft username").setRequired(true))
    .addStringOption(o => o.setName("kit").setDescription("Kit (Sword, Axe...)").setRequired(true))
    .addStringOption(o => o.setName("tier").setDescription("Tier code (HT1, LT3...)").setRequired(true))
    .addIntegerOption(o => o.setName("points").setDescription("Points").setRequired(true)),

  new SlashCommandBuilder()
    .setName("link-mc")
    .setDescription("Link your Discord account with Minecraft username.")
    .addStringOption(o => o.setName("username").setDescription("Minecraft username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unlink-mc")
    .setDescription("Unlink your Minecraft account from your Discord account."),

  new SlashCommandBuilder()
    .setName("whois")
    .setDescription("Look up a linked account.")
    .addUserOption(o => o.setName("user").setDescription("Discord user").setRequired(false))
    .addStringOption(o => o.setName("username").setDescription("Minecraft username").setRequired(false)),

  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Shows bot uptime."),
];

// ============================================
// Ready event
// ============================================
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: "ranktiers.com" }],
    status: "online",
  });

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.commands.set(commands);

  console.log("Commands registered + status set.");
});

// ============================================
// /link-mc
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "link-mc") return;

  const username = interaction.options.getString("username");
  const discordId = interaction.user.id;
  let links = loadLinks();

  for (const mc of Object.keys(links)) {
    if (links[mc] === discordId) {
      return interaction.reply({ content: `❌ You're already linked to **${mc}**.`, flags: 64 });
    }
  }

  if (links[username]) {
    return interaction.reply({ content: `❌ **${username}** is already linked.`, flags: 64 });
  }

  links[username] = discordId;
  saveLinks(links);

  return interaction.reply(`✅ Linked **${username}** to your Discord account!`);
});

// ============================================
// /unlink-mc
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "unlink-mc") return;

  const discordId = interaction.user.id;
  let links = loadLinks();

  const entry = Object.entries(links).find(([, id]) => id === discordId);

  if (!entry) {
    return interaction.reply({ content: "❌ You don't have a linked Minecraft account.", flags: 64 });
  }

  const [linkedMc] = entry;
  delete links[linkedMc];
  saveLinks(links);

  return interaction.reply(`✅ Unlinked **${linkedMc}** from your Discord account!`);
});

// ============================================
// /whois
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "whois") return;

  const user = interaction.options.getUser("user");
  const mcName = interaction.options.getString("username");
  const links = loadLinks();

  if (!user && !mcName) {
    return interaction.reply({ content: "❌ Provide a user or a MC username.", flags: 64 });
  }

  if (mcName) {
    const id = links[mcName];
    if (!id) return interaction.reply({ content: `❌ No link found for **${mcName}**.`, flags: 64 });

    const discordUser = await client.users.fetch(id).catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle("Whois Lookup")
      .addFields(
        { name: "Minecraft", value: mcName },
        { name: "Discord", value: discordUser ? `${discordUser.tag} (<@${discordUser.id}>)` : id }
      )
      .setThumbnail(getSkinHeadUrl(mcName))
      .setColor("Blue");

    return interaction.reply({ embeds: [embed] });
  }

  const entry = Object.entries(links).find(([, id]) => id === user.id);

  if (!entry) {
    return interaction.reply({ content: `❌ ${user.tag} has no linked MC account.`, flags: 64 });
  }

  const [linkedMc] = entry;

  const embed = new EmbedBuilder()
    .setTitle("Whois Lookup")
    .addFields(
      { name: "Discord", value: `${user.tag} (<@${user.id}>)` },
      { name: "Minecraft", value: linkedMc }
    )
    .setThumbnail(getSkinHeadUrl(linkedMc))
    .setColor("Blue");

  return interaction.reply({ embeds: [embed] });
});

// ============================================
// /uptime
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "uptime") return;

  const ms = Date.now() - botStartTime;

  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60000) % 60;
  const hr = Math.floor(ms / 3600000) % 24;
  const day = Math.floor(ms / 86400000);

  const embed = new EmbedBuilder()
    .setTitle("⏳ Bot Uptime")
    .addFields(
      { name: "Uptime", value: `${day}d ${hr}h ${min}m ${sec}s` },
      { name: "Started", value: `<t:${Math.floor(botStartTime / 1000)}:R>` }
    )
    .setColor("Aqua");

  return interaction.reply({ embeds: [embed] });
});

// ============================================
// /queue
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "queue") return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Admin only.", flags: 64 });
  }

  const embed = new EmbedBuilder()
    .setTitle("🧩 Testing Queue Signup")
    .setDescription("Click Join below.\nYou'll be asked for your MC details.")
    .setColor(0x2f3136);

  const btn = new ButtonBuilder()
    .setCustomId("join_queue")
    .setLabel("Join Queue")
    .setStyle(ButtonStyle.Primary);

  return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
});

// ============================================
// Button → modal
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
// /add-tier → sends embed to log channel
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

  // Supabase syncing...
  let { data: playerData } = await supabase
    .from("players")
    .select("id")
    .eq("username", username)
    .single();

  let playerId = playerData?.id;

  if (!playerId) {
    const { data } = await supabase.from("players").insert({ username }).select().single();
    playerId = data.id;
  }

  const { data: kitData } = await supabase
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

  const embed = new EmbedBuilder()
    .setTitle(`🧱 Tier Updated: ${username}`)
    .setThumbnail(getSkinHeadUrl(username))
    .addFields(
      { name: "Username", value: username, inline: true },
      { name: "Kit", value: kit, inline: true },
      { name: "Tier", value: tier, inline: true },
      { name: "Points", value: points.toString(), inline: true }
    )
    .setColor("Green")
    .setTimestamp();

  // MAIN LOG CHANNEL
  const logChannel = await client.channels.fetch(process.env.TIER_LOG_CHANNEL).catch(() => null);

  if (!logChannel) {
    return interaction.reply({
      content: "❌ Tier log channel is invalid. Set TIER_LOG_CHANNEL in .env",
      flags: 64,
    });
  }

  const msg = await logChannel.send({ embeds: [embed] });

  await msg.react("✅");
  await msg.react("❌");

  return interaction.reply({
    content: `✅ Updated **${username}** → **${kit} ${tier} (${points} pts)**.\nEmbed sent to log channel.`,
    flags: 64,
  });
});

// ============================================
// Login
// ============================================
client.login(process.env.DISCORD_TOKEN);