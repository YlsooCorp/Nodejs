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
  return JSON.parse(fs.readFileSync(linksPath));
}

// Save links
function saveLinks(data) {
  fs.writeFileSync(linksPath, JSON.stringify(data, null, 2));
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
    .addStringOption(opt =>
      opt.setName("username").setDescription("Minecraft username").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("kit").setDescription("Kit name (e.g., Sword)").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("tier").setDescription("Tier code (e.g., HT1, LT3)").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("points").setDescription("Player points (e.g., 1200)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("link-mc")
    .setDescription("Link your Discord account to your Minecraft username.")
    .addStringOption(opt =>
      opt.setName("username").setDescription("Your Minecraft username").setRequired(true)
    ),
];

// 🟢 Register commands
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.commands.set(commands);
  console.log("✅ Slash commands registered.");
});

// ============================================
// 🔗 /link-mc — Link Discord → Minecraft
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "link-mc") return;

  const username = interaction.options.getString("username");
  const discordId = interaction.user.id;

  let links = loadLinks();

  // 1️⃣ This Discord user already linked?
  for (const mcName in links) {
    if (links[mcName] === discordId) {
      return interaction.reply({
        content: `❌ You already linked your account to **${mcName}**.`,
        flags: 64,
      });
    }
  }

  // 2️⃣ This Minecraft username already linked to someone else?
  if (links[username]) {
    return interaction.reply({
      content: `❌ The Minecraft username **${username}** is already linked to another Discord user.`,
      flags: 64,
    });
  }

  // 3️⃣ Save link
  links[username] = discordId;
  saveLinks(links);

  interaction.reply({
    content: `✅ Successfully linked **${username}** to your Discord account!`,
  });
});

// ============================================
// 🧱 /queue command — Post queue embed
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "queue") return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ You must be an admin to use this.", flags: 64 });
  }

  const embed = new EmbedBuilder()
    .setTitle("🧩 Testing Queue Signup")
    .setDescription("Click below to join the testing queue.\nYou'll be asked for your Minecraft details.")
    .setColor(0x2f3136);

  const joinButton = new ButtonBuilder()
    .setCustomId("join_queue")
    .setLabel("Join Queue")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(joinButton);
  await interaction.reply({ embeds: [embed], components: [row] });
});

// ============================================
// 🧩 Join queue button → open modal
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton() || interaction.customId !== "join_queue") return;

  const modal = new ModalBuilder().setCustomId("queue_modal").setTitle("Join Testing Queue");

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
        .setPlaceholder("Example: hypixel.net or mctiers.com")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("region")
        .setLabel("Region (e.g., EU, NA, ASIA)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("kit")
        .setLabel("Kit (e.g., Sword, Axe, Lifesteal)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
});

// ============================================
// 🧾 Modal submission → create private channel
// ============================================
client.on("interactionCreate", async interaction => {
  if (interaction.type !== InteractionType.ModalSubmit || interaction.customId !== "queue_modal") return;

  const username = interaction.fields.getTextInputValue("username");
  const server = interaction.fields.getTextInputValue("server");
  const region = interaction.fields.getTextInputValue("region");
  const kit = interaction.fields.getTextInputValue("kit");

  // Validate server format
  if (!server.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    return interaction.reply({
      content: "❌ Please enter a valid Minecraft server (e.g., hypixel.net).",
      flags: 64,
    });
  }

  const guild = interaction.guild;
  const channelName = `test-${username.toLowerCase()}`;
  const testChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] },
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(`🧪 Testing Session - ${username}`)
    .addFields(
      { name: "Minecraft Server", value: server, inline: true },
      { name: "Region", value: region, inline: true },
      { name: "Kit", value: kit, inline: true }
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Press 'Close' when testing is done." });

  const closeButton = new ButtonBuilder()
    .setCustomId("close_channel")
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);

  await testChannel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(closeButton)],
  });

  await interaction.reply({
    content: `✅ Created private testing channel: ${testChannel}`,
    flags: 64,
  });
});

// ============================================
// ❌ Close channel button
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton() || interaction.customId !== "close_channel") return;
  await interaction.channel.delete().catch(err => console.error("Failed to delete channel:", err));
});

// ============================================
// 🧠 /add-tier — Supabase integration
// ============================================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "add-tier") return;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ You must be an admin to use this.", flags: 64 });
  }

  const username = interaction.options.getString("username");
  const kit = interaction.options.getString("kit");
  const tier = interaction.options.getString("tier");
  const points = interaction.options.getInteger("points");

  // Get or create player
  let { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("username", username)
    .single();

  let playerId = playerData?.id;
  if (playerError && playerError.code !== "PGRST116") {
    console.error(playerError);
    return interaction.reply({ content: "❌ Database error.", flags: 64 });
  }

  if (!playerId) {
    const { data, error } = await supabase
      .from("players")
      .insert({ username })
      .select()
      .single();
    if (error) return interaction.reply({ content: "❌ Could not create player.", flags: 64 });
    playerId = data.id;
  }

  // Get kit ID
  const { data: kitData, error: kitError } = await supabase
    .from("kits")
    .select("id")
    .eq("name", kit)
    .single();

  if (kitError || !kitData) {
    return interaction.reply({ content: `❌ Kit "${kit}" not found.`, flags: 64 });
  }

  // Update or insert
  const { data: existing, error: existingError } = await supabase
    .from("player_kits")
    .select("id")
    .eq("player_id", playerId)
    .eq("kit_id", kitData.id)
    .single();

  if (existingError && existingError.code !== "PGRST116") {
    console.error(existingError);
    return interaction.reply({ content: "❌ Database lookup failed.", flags: 64 });
  }

  let dbError;
  if (existing) {
    const { error } = await supabase
      .from("player_kits")
      .update({ tier_code: tier, points })
      .eq("id", existing.id);
    dbError = error;
  } else {
    const { error } = await supabase
      .from("player_kits")
      .insert({ player_id: playerId, kit_id: kitData.id, tier_code: tier, points });
    dbError = error;
  }

  if (dbError) {
    console.error(dbError);
    return interaction.reply({ content: "❌ Failed to update tier.", flags: 64 });
  }

  interaction.reply({
    content: `✅ Updated **${username}** → **${kit} ${tier} (${points} pts)** successfully!`,
  });
});

// ============================================
// 🚀 Start bot
// ============================================
client.login(process.env.DISCORD_TOKEN);