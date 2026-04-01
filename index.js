const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
} = require("discord.js");
require("dotenv/config");
const fs = require("fs");
const path = require("path");

// ─── CONFIG ───
const TOKEN = process.env.BOT_TOKEN;
const STAFF_ROLE_ID = "1488409640701136968";
const CAPTAIN_ROLE_ID = "1488685991626674266";
const LOG_CHANNEL_ID = "1488776740758098001";
const SCORES_CHANNEL_ID = "1488411823383515277";
const STANDINGS_CHANNEL_ID = "1488773240905011210";
const DATA_FILE = path.join(__dirname, "data.json");

// ─── DATA LAYER ───
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ crews: {}, pending: {}, period: null, records: {}, scores: [] }));
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  // Ensure new fields exist for older data files
  if (!data.period) data.period = null;
  if (!data.records) data.records = {};
  if (!data.scores) data.scores = [];
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── HELPERS ───
function isStaff(member) {
  return member.roles.cache.has(STAFF_ROLE_ID);
}

function findUserCrew(data, userId) {
  for (const [roleId, crew] of Object.entries(data.crews)) {
    if (
      crew.ownerId === userId ||
      crew.captains.includes(userId) ||
      crew.players.includes(userId)
    ) {
      return { roleId, crew };
    }
  }
  return null;
}

function getUserRank(crew, userId) {
  if (crew.ownerId === userId) return "owner";
  if (crew.captains.includes(userId)) return "captain";
  if (crew.players.includes(userId)) return "player";
  return null;
}

function removeFromCrew(crew, userId) {
  crew.captains = crew.captains.filter((id) => id !== userId);
  crew.players = crew.players.filter((id) => id !== userId);
}

function embed(title, desc, color = 0x2b2d31) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
}

function successEmbed(title, desc) {
  return embed(title, desc, 0x57f287);
}

function errorEmbed(title, desc) {
  return embed(title, desc, 0xed4245);
}

function infoEmbed(title, desc) {
  return embed(title, desc, 0x5865f2);
}

// ─── TRANSACTION LOG ───
const TX_TYPES = {
  SIGN:         { label: "📝 SIGNED",         color: 0x57f287 },
  RELEASE:      { label: "RELEASED",          color: 0xed4245 },
  PROMOTE:      { label: "PROMOTED",          color: 0xfee75c },
  DEMOTE:       { label: "DEMOTED",           color: 0xe67e22 },
  LEAVE:        { label: "LEFT CREW",         color: 0x95a5a6 },
  FORCE_SIGN:   { label: "⚡ FORCE SIGNED",   color: 0x57f287 },
  FORCE_RELEASE:{ label: "⚡ FORCE RELEASED", color: 0xed4245 },
  CREW_CREATED: { label: "CREW CREATED",      color: 0x5865f2 },
  CREW_REMOVED: { label: "CREW REMOVED",      color: 0x2b2d31 },
  DISBAND:      { label: "CREW DISBANDED",    color: 0x2b2d31 },
  OWNER_CHANGE: { label: "👑 OWNER TRANSFER", color: 0xf1c40f },
};

async function logTransaction(guild, type, fields) {
  try {
    const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const tx = TX_TYPES[type];

    const logEmbed = new EmbedBuilder()
      .setColor(tx.color)
      .setTitle(tx.label)
      .setTimestamp()
      .setFooter({ text: "TFW Transactions" });

    for (const [name, value] of Object.entries(fields)) {
      logEmbed.addFields({ name, value: String(value), inline: true });
    }

    await channel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error("Failed to log transaction:", err.message);
  }
}

// ─── STANDINGS ───
function getRecord(data, roleId) {
  if (!data.records[roleId]) {
    data.records[roleId] = { wins: 0, losses: 0, streak: 0, streakType: null };
  }
  return data.records[roleId];
}

function addWin(data, roleId) {
  const rec = getRecord(data, roleId);
  rec.wins++;
  if (rec.streakType === "W") {
    rec.streak++;
  } else {
    rec.streakType = "W";
    rec.streak = 1;
  }
}

function addLoss(data, roleId) {
  const rec = getRecord(data, roleId);
  rec.losses++;
  if (rec.streakType === "L") {
    rec.streak++;
  } else {
    rec.streakType = "L";
    rec.streak = 1;
  }
}

function buildStandingsEmbed(data, guild) {
  const crewIds = Object.keys(data.crews);
  const periodName = data.period?.name || "No Active Period";

  const rows = crewIds.map((roleId) => {
    const role = guild.roles.cache.get(roleId);
    const name = role?.name || "Unknown";
    const rec = data.records[roleId] || { wins: 0, losses: 0, streak: 0, streakType: null };
    const winPct = rec.wins + rec.losses > 0
      ? (rec.wins / (rec.wins + rec.losses)).toFixed(3)
      : ".000";
    return { name, wins: rec.wins, losses: rec.losses, winPct: parseFloat(winPct), streak: rec.streak, streakType: rec.streakType };
  });

  // Sort by wins desc, then losses asc, then name
  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.name.localeCompare(b.name);
  });

  let desc = "";
  if (rows.length === 0) {
    desc = "No crews registered.";
  } else {
    // Header
    desc = "```\n";
    desc += " #  Team                 W    L    PCT    STK\n";
    desc += "───────────────────────────────────────────────\n";
    rows.forEach((r, i) => {
      const rank = String(i + 1).padStart(2);
      const team = r.name.length > 18 ? r.name.slice(0, 18) + ".." : r.name.padEnd(20);
      const w = String(r.wins).padStart(2);
      const l = String(r.losses).padStart(2);
      const pct = r.winPct.toFixed(3).padStart(5);
      let stk = "  -";
      if (r.streakType) {
        stk = `${r.streakType}${r.streak}`.padStart(3);
      }
      desc += `${rank}  ${team} ${w}   ${l}   ${pct}   ${stk}\n`;
    });
    desc += "```";
  }

  return new EmbedBuilder()
    .setTitle(`${periodName} Standings`)
    .setDescription(desc)
    .setColor(0x5865f2)
    .setTimestamp()
    .setFooter({ text: "TFW Crew Wars" });
}

async function updateStandingsMessage(guild, data) {
  try {
    const channel = await guild.channels.fetch(STANDINGS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const standingsEmbed = buildStandingsEmbed(data, guild);

    if (data.period?.standingsMessageId) {
      // Try to edit existing message
      try {
        const msg = await channel.messages.fetch(data.period.standingsMessageId);
        await msg.edit({ embeds: [standingsEmbed] });
        return;
      } catch {
        // Message was deleted, send a new one
      }
    }

    // Send new message and save its ID
    const msg = await channel.send({ embeds: [standingsEmbed] });
    if (!data.period) {
      data.period = { name: "Preseason", startedAt: new Date().toISOString() };
    }
    data.period.standingsMessageId = msg.id;
    saveData(data);
  } catch (err) {
    console.error("Failed to update standings:", err.message);
  }
}

// ─── BOT SETUP ───
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`${client.user.tag} is online!`);
  client.user.setActivity("TFW Crew Wars", { type: 3 });
});

// ─── SCORE LISTENER ───
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== SCORES_CHANNEL_ID) return;

  // Match pattern: <@&ROLE_ID> SCORE-SCORE <@&ROLE_ID>
  const scoreRegex = /<@&(\d+)>\s+(\d+)\s*-\s*(\d+)\s+<@&(\d+)>/;
  const match = message.content.match(scoreRegex);
  if (!match) return;

  const [, team1Id, score1Str, score2Str, team2Id] = match;
  const score1 = parseInt(score1Str);
  const score2 = parseInt(score2Str);

  const data = loadData();

  // Both must be registered crews
  if (!data.crews[team1Id] || !data.crews[team2Id]) return;
  if (team1Id === team2Id) return;

  // Determine winner/loser
  if (score1 > score2) {
    addWin(data, team1Id);
    addLoss(data, team2Id);
  } else if (score2 > score1) {
    addWin(data, team2Id);
    addLoss(data, team1Id);
  } else {
    // Tie — count as a win for both? Or skip. Skipping ties.
    return;
  }

  // Save the score
  data.scores.push({
    team1: team1Id,
    score1,
    team2: team2Id,
    score2,
    messageId: message.id,
    timestamp: Date.now(),
  });

  saveData(data);

  // Update standings
  await updateStandingsMessage(message.guild, data);

  // React to confirm it was tracked
  await message.react("✅").catch(() => {});
});

// ═══════════════════════════════════════
// SLASH COMMAND HANDLER
// ═══════════════════════════════════════
client.on("interactionCreate", async (interaction) => {
  // ── Button interactions (sign accept/reject) ──
  if (interaction.isButton()) {
    return handleButton(interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const data = loadData();

  try {
    switch (commandName) {
      case "addcrew":
        return await cmdAddCrew(interaction, data);
      case "removecrew":
        return await cmdRemoveCrew(interaction, data);
      case "setowner":
        return await cmdSetOwner(interaction, data);
      case "forcesign":
        return await cmdForcesign(interaction, data);
      case "forcerelease":
        return await cmdForcerelease(interaction, data);
      case "sign":
        return await cmdSign(interaction, data);
      case "release":
        return await cmdRelease(interaction, data);
      case "promote":
        return await cmdPromote(interaction, data);
      case "demote":
        return await cmdDemote(interaction, data);
      case "leave":
        return await cmdLeave(interaction, data);
      case "disband":
        return await cmdDisband(interaction, data);
      case "startperiod":
        return await cmdStartPeriod(interaction, data);
      case "forceupdaterankings":
        return await cmdForceUpdateRankings(interaction, data);
      case "updateteamrecord":
        return await cmdUpdateTeamRecord(interaction, data);
      case "roster":
        return await cmdRoster(interaction, data);
      case "crews":
        return await cmdCrews(interaction, data);
      case "freeagents":
        return await cmdFreeAgents(interaction, data);
      case "myteam":
        return await cmdMyTeam(interaction, data);
      default:
        return;
    }
  } catch (err) {
    console.error(`Error in /${commandName}:`, err);
    const reply = { embeds: [errorEmbed("Error", "Something went wrong. Try again.")], ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ═══════════════════════════════════════
// STAFF COMMANDS
// ═══════════════════════════════════════

async function cmdAddCrew(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const role = interaction.options.getRole("role");
  const owner = interaction.options.getUser("owner");

  if (data.crews[role.id]) {
    return interaction.reply({ embeds: [errorEmbed("Already Exists", `${role} is already registered as a crew.`)], ephemeral: true });
  }

  // Check if owner is already on another crew
  const existing = findUserCrew(data, owner.id);
  if (existing) {
    const existingRole = interaction.guild.roles.cache.get(existing.roleId);
    return interaction.reply({
      embeds: [errorEmbed("Already Signed", `${owner} is already on **${existingRole?.name || "a crew"}**.`)],
      ephemeral: true,
    });
  }

  // Fetch all members with the role to register them
  await interaction.guild.members.fetch();
  const membersWithRole = role.members.map((m) => m.id).filter((id) => id !== owner.id);

  // Check if any of those members are already on a crew
  const conflicts = [];
  for (const mId of membersWithRole) {
    const c = findUserCrew(data, mId);
    if (c) conflicts.push(mId);
  }

  data.crews[role.id] = {
    ownerId: owner.id,
    captains: [],
    players: membersWithRole.filter((id) => !conflicts.includes(id)),
    createdAt: new Date().toISOString(),
  };

  // Make sure owner has the role
  const ownerMember = await interaction.guild.members.fetch(owner.id).catch(() => null);
  if (ownerMember && !ownerMember.roles.cache.has(role.id)) {
    await ownerMember.roles.add(role.id).catch(() => {});
  }

  saveData(data);

  const totalPlayers = data.crews[role.id].players.length + 1; // +1 for owner
  let desc = `**Crew:** ${role}\n**Franchise Owner:** ${owner}\n**Players Registered:** ${totalPlayers}`;
  if (conflicts.length > 0) {
    desc += `\n\n${conflicts.length} member(s) with the role were skipped because they're already on another crew.`;
  }

  await logTransaction(interaction.guild, "CREW_CREATED", {
    "Crew": role.name,
    "Owner": `<@${owner.id}>`,
    "Roster Size": `${totalPlayers} players`,
    "Created By": `<@${interaction.user.id}>`,
  });

  return interaction.reply({ embeds: [successEmbed("Crew Created", desc)] });
}

async function cmdRemoveCrew(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const role = interaction.options.getRole("role");

  if (!data.crews[role.id]) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${role} is not a registered crew.`)], ephemeral: true });
  }

  delete data.crews[role.id];

  // Also clean up any pending signings for this crew
  for (const [userId, p] of Object.entries(data.pending)) {
    if (p.crewRoleId === role.id) delete data.pending[userId];
  }

  saveData(data);

  await logTransaction(interaction.guild, "CREW_REMOVED", {
    "Crew": role.name,
    "Removed By": `<@${interaction.user.id}>`,
  });

  return interaction.reply({ embeds: [successEmbed("Crew Removed", `**${role.name}** has been unregistered. The role itself was not deleted.`)] });
}

async function cmdSetOwner(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const role = interaction.options.getRole("role");
  const user = interaction.options.getUser("user");
  const crew = data.crews[role.id];

  if (!crew) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${role} is not a registered crew.`)], ephemeral: true });
  }

  // If new owner is on a different crew, block it
  const existing = findUserCrew(data, user.id);
  if (existing && existing.roleId !== role.id) {
    return interaction.reply({ embeds: [errorEmbed("Already Signed", `${user} is on another crew.`)], ephemeral: true });
  }

  // Demote old owner to player
  const oldOwnerId = crew.ownerId;
  crew.players.push(oldOwnerId);

  // Remove new owner from players/captains if they were there
  removeFromCrew(crew, user.id);

  crew.ownerId = user.id;

  // Give role if needed
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member && !member.roles.cache.has(role.id)) {
    await member.roles.add(role.id).catch(() => {});
  }

  saveData(data);

  await logTransaction(interaction.guild, "OWNER_CHANGE", {
    "Crew": role.name,
    "New Owner": `<@${user.id}>`,
    "Previous Owner": `<@${oldOwnerId}>`,
    "Changed By": `<@${interaction.user.id}>`,
  });

  return interaction.reply({
    embeds: [successEmbed("Owner Changed", `${user} is now the Franchise Owner of **${role.name}**.\n<@${oldOwnerId}> has been moved to player.`)],
  });
}

async function cmdForcesign(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const user = interaction.options.getUser("user");
  const role = interaction.options.getRole("role");
  const crew = data.crews[role.id];

  if (!crew) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${role} is not a registered crew.`)], ephemeral: true });
  }

  const existing = findUserCrew(data, user.id);
  if (existing) {
    return interaction.reply({ embeds: [errorEmbed("Already Signed", `${user} is already on a crew.`)], ephemeral: true });
  }

  crew.players.push(user.id);

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.add(role.id).catch(() => {});

  saveData(data);

  await logTransaction(interaction.guild, "FORCE_SIGN", {
    "Player": `<@${user.id}>`,
    "Crew": role.name,
    "Signed By": `<@${interaction.user.id}> (Staff)`,
  });

  return interaction.reply({ embeds: [successEmbed("Force Signed", `${user} has been added to **${role.name}** by staff.`)] });
}

async function cmdForcerelease(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const user = interaction.options.getUser("user");
  const result = findUserCrew(data, user.id);

  if (!result) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${user} is not on any crew.`)], ephemeral: true });
  }

  if (result.crew.ownerId === user.id) {
    return interaction.reply({ embeds: [errorEmbed("Cannot Release", `${user} is the Franchise Owner. Use \`/setowner\` to transfer ownership first.`)], ephemeral: true });
  }

  const wasCaptain = result.crew.captains.includes(user.id);
  removeFromCrew(result.crew, user.id);

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member) {
    await member.roles.remove(result.roleId).catch(() => {});
    if (wasCaptain) await member.roles.remove(CAPTAIN_ROLE_ID).catch(() => {});
  }

  saveData(data);

  const roleName = interaction.guild.roles.cache.get(result.roleId)?.name || "Unknown";

  await logTransaction(interaction.guild, "FORCE_RELEASE", {
    "Player": `<@${user.id}>`,
    "Crew": roleName,
    "Released By": `<@${interaction.user.id}> (Staff)`,
  });

  return interaction.reply({ embeds: [successEmbed("Force Released", `${user} has been removed from **${roleName}** by staff.`)] });
}

// ═══════════════════════════════════════
// OWNER / CAPTAIN COMMANDS
// ═══════════════════════════════════════

async function cmdSign(interaction, data) {
  const userCrew = findUserCrew(data, interaction.user.id);

  if (!userCrew) {
    return interaction.reply({ embeds: [errorEmbed("No Crew", "You're not on a crew.")], ephemeral: true });
  }

  const rank = getUserRank(userCrew.crew, interaction.user.id);
  if (rank !== "owner" && rank !== "captain") {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the Franchise Owner or Captains can sign players.")], ephemeral: true });
  }

  const target = interaction.options.getUser("user");

  if (target.bot) {
    return interaction.reply({ embeds: [errorEmbed("Invalid", "You can't sign a bot.")], ephemeral: true });
  }

  const targetCrew = findUserCrew(data, target.id);
  if (targetCrew) {
    return interaction.reply({ embeds: [errorEmbed("Already Signed", `${target} is already on a crew.`)], ephemeral: true });
  }

  // Check for existing pending invite
  if (data.pending[target.id]) {
    return interaction.reply({ embeds: [errorEmbed("Pending Invite", `${target} already has a pending signing invite.`)], ephemeral: true });
  }

  const crewRole = interaction.guild.roles.cache.get(userCrew.roleId);
  const crewName = crewRole?.name || "Unknown Crew";

  // Store pending signing
  data.pending[target.id] = {
    crewRoleId: userCrew.roleId,
    signedBy: interaction.user.id,
    guildId: interaction.guild.id,
    timestamp: Date.now(),
  };
  saveData(data);

  // Send DM to the target
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sign_accept_${target.id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`sign_reject_${target.id}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
  );

  const dmEmbed = infoEmbed(
    "Crew Signing Offer",
    `You've been invited to join **${crewName}** in **${interaction.guild.name}**!\n\n` +
      `**Invited by:** ${interaction.user.tag}\n\n` +
      `Click below to accept or reject. This offer expires in 24 hours.`
  );

  try {
    await target.send({ embeds: [dmEmbed], components: [row] });
  } catch {
    delete data.pending[target.id];
    saveData(data);
    return interaction.reply({
      embeds: [errorEmbed("DM Failed", `Could not send a DM to ${target}. They may have DMs disabled.`)],
      ephemeral: true,
    });
  }

  return interaction.reply({
    embeds: [successEmbed("Offer Sent", `A signing offer has been sent to ${target} for **${crewName}**.\nWaiting for their response...`)],
  });
}

async function cmdRelease(interaction, data) {
  const userCrew = findUserCrew(data, interaction.user.id);

  if (!userCrew) {
    return interaction.reply({ embeds: [errorEmbed("No Crew", "You're not on a crew.")], ephemeral: true });
  }

  const rank = getUserRank(userCrew.crew, interaction.user.id);
  if (rank !== "owner" && rank !== "captain") {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the Franchise Owner or Captains can release players.")], ephemeral: true });
  }

  const target = interaction.options.getUser("user");
  const targetRank = getUserRank(userCrew.crew, target.id);

  if (!targetRank) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${target} is not on your crew.`)], ephemeral: true });
  }

  if (targetRank === "owner") {
    return interaction.reply({ embeds: [errorEmbed("Cannot Release", "You can't release the Franchise Owner.")], ephemeral: true });
  }

  // Captains can't release other captains
  if (rank === "captain" && targetRank === "captain") {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Captains cannot release other captains.")], ephemeral: true });
  }

  const wasCaptain = targetRank === "captain";
  removeFromCrew(userCrew.crew, target.id);

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    await member.roles.remove(userCrew.roleId).catch(() => {});
    if (wasCaptain) await member.roles.remove(CAPTAIN_ROLE_ID).catch(() => {});
  }

  saveData(data);

  const crewName = interaction.guild.roles.cache.get(userCrew.roleId)?.name || "Unknown";

  await logTransaction(interaction.guild, "RELEASE", {
    "Player": `<@${target.id}>`,
    "Crew": crewName,
    "Released By": `<@${interaction.user.id}>`,
  });

  return interaction.reply({ embeds: [successEmbed("Player Released", `${target} has been released from **${crewName}**.`)] });
}

async function cmdPromote(interaction, data) {
  const userCrew = findUserCrew(data, interaction.user.id);

  if (!userCrew || userCrew.crew.ownerId !== interaction.user.id) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the Franchise Owner can promote players.")], ephemeral: true });
  }

  const target = interaction.options.getUser("user");

  if (!userCrew.crew.players.includes(target.id)) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${target} is not a regular player on your crew.`)], ephemeral: true });
  }

  userCrew.crew.players = userCrew.crew.players.filter((id) => id !== target.id);
  userCrew.crew.captains.push(target.id);
  saveData(data);

  // Give the captain role
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) await member.roles.add(CAPTAIN_ROLE_ID).catch(() => {});

  const crewName = interaction.guild.roles.cache.get(userCrew.roleId)?.name || "Unknown";

  await logTransaction(interaction.guild, "PROMOTE", {
    "Player": `<@${target.id}>`,
    "Promoted To": "Captain",
    "Crew": crewName,
    "Promoted By": `<@${interaction.user.id}>`,
  });

  return interaction.reply({ embeds: [successEmbed("Player Promoted", `${target} has been promoted to **Captain** of **${crewName}**.`)] });
}

async function cmdDemote(interaction, data) {
  const userCrew = findUserCrew(data, interaction.user.id);

  if (!userCrew || userCrew.crew.ownerId !== interaction.user.id) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the Franchise Owner can demote captains.")], ephemeral: true });
  }

  const target = interaction.options.getUser("user");

  if (!userCrew.crew.captains.includes(target.id)) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${target} is not a captain on your crew.`)], ephemeral: true });
  }

  userCrew.crew.captains = userCrew.crew.captains.filter((id) => id !== target.id);
  userCrew.crew.players.push(target.id);
  saveData(data);

  // Remove the captain role
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) await member.roles.remove(CAPTAIN_ROLE_ID).catch(() => {});

  const crewName = interaction.guild.roles.cache.get(userCrew.roleId)?.name || "Unknown";

  await logTransaction(interaction.guild, "DEMOTE", {
    "Player": `<@${target.id}>`,
    "Demoted To": "Player",
    "Crew": crewName,
    "Demoted By": `<@${interaction.user.id}>`,
  });

  return interaction.reply({ embeds: [successEmbed("Captain Demoted", `${target} has been demoted to regular player on **${crewName}**.`)] });
}

// ═══════════════════════════════════════
// MEMBER COMMANDS
// ═══════════════════════════════════════

async function cmdLeave(interaction, data) {
  const userCrew = findUserCrew(data, interaction.user.id);

  if (!userCrew) {
    return interaction.reply({ embeds: [errorEmbed("No Crew", "You're not on any crew.")], ephemeral: true });
  }

  if (userCrew.crew.ownerId === interaction.user.id) {
    return interaction.reply({
      embeds: [errorEmbed("Cannot Leave", "You're the Franchise Owner. Ask staff to transfer ownership first with `/setowner`.")],
      ephemeral: true,
    });
  }

  const wasCaptain = userCrew.crew.captains.includes(interaction.user.id);
  removeFromCrew(userCrew.crew, interaction.user.id);

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (member) {
    await member.roles.remove(userCrew.roleId).catch(() => {});
    if (wasCaptain) await member.roles.remove(CAPTAIN_ROLE_ID).catch(() => {});
  }

  saveData(data);

  const crewName = interaction.guild.roles.cache.get(userCrew.roleId)?.name || "Unknown";

  await logTransaction(interaction.guild, "LEAVE", {
    "Player": `<@${interaction.user.id}>`,
    "Crew": crewName,
  });

  return interaction.reply({ embeds: [successEmbed("Left Crew", `You have left **${crewName}**. You're now a free agent.`)] });
}

async function cmdDisband(interaction, data) {
  const userCrew = findUserCrew(data, interaction.user.id);

  if (!userCrew || userCrew.crew.ownerId !== interaction.user.id) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the Franchise Owner can disband their crew.")], ephemeral: true });
  }

  const role = interaction.guild.roles.cache.get(userCrew.roleId);
  const crewName = role?.name || "Unknown";

  // Remove captain role from all captains
  for (const capId of userCrew.crew.captains) {
    const member = await interaction.guild.members.fetch(capId).catch(() => null);
    if (member) await member.roles.remove(CAPTAIN_ROLE_ID).catch(() => {});
  }

  // Clean up pending signings for this crew
  for (const [userId, p] of Object.entries(data.pending)) {
    if (p.crewRoleId === userCrew.roleId) delete data.pending[userId];
  }

  // Delete the crew data
  delete data.crews[userCrew.roleId];

  // Delete records
  delete data.records[userCrew.roleId];

  saveData(data);

  // Delete the Discord role
  if (role) {
    await role.delete(`Disbanded by ${interaction.user.tag}`).catch(() => {});
  }

  await logTransaction(interaction.guild, "DISBAND", {
    "Crew": crewName,
    "Disbanded By": `<@${interaction.user.id}>`,
  });

  // Update standings since a crew was removed
  await updateStandingsMessage(interaction.guild, data);

  return interaction.reply({ embeds: [successEmbed("Crew Disbanded", `**${crewName}** has been disbanded and the role has been deleted.`)] });
}

// ═══════════════════════════════════════
// STANDINGS COMMANDS (STAFF)
// ═══════════════════════════════════════

async function cmdStartPeriod(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const periodName = interaction.options.getString("name");

  // Reset all records
  data.records = {};
  data.scores = [];

  // Create new period
  data.period = {
    name: periodName,
    startedAt: new Date().toISOString(),
    standingsMessageId: null,
  };

  saveData(data);

  // Post announcement in scores channel
  const scoresChannel = await interaction.guild.channels.fetch(SCORES_CHANNEL_ID).catch(() => null);
  if (scoresChannel) {
    const announcementEmbed = new EmbedBuilder()
      .setTitle(`${periodName} Has Begun`)
      .setDescription(`All records have been reset to 0-0. Good luck to all crews.`)
      .setColor(0x5865f2)
      .setTimestamp()
      .setFooter({ text: "TFW Crew Wars" });

    await scoresChannel.send({ embeds: [announcementEmbed] });
  }

  // Post fresh standings
  await updateStandingsMessage(interaction.guild, data);

  return interaction.reply({ embeds: [successEmbed("Period Started", `**${periodName}** has begun. All records have been reset.`)] });
}

async function cmdForceUpdateRankings(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  await interaction.deferReply();

  // Reset all records
  data.records = {};

  // Re-read all saved scores from current period and recalculate
  for (const score of data.scores) {
    // Verify both crews still exist
    if (!data.crews[score.team1] || !data.crews[score.team2]) continue;

    if (score.score1 > score.score2) {
      addWin(data, score.team1);
      addLoss(data, score.team2);
    } else if (score.score2 > score.score1) {
      addWin(data, score.team2);
      addLoss(data, score.team1);
    }
  }

  saveData(data);
  await updateStandingsMessage(interaction.guild, data);

  // Build a summary
  let summary = "";
  for (const roleId of Object.keys(data.crews)) {
    const role = interaction.guild.roles.cache.get(roleId);
    const rec = data.records[roleId] || { wins: 0, losses: 0 };
    summary += `**${role?.name || "Unknown"}** — ${rec.wins}-${rec.losses}\n`;
  }

  return interaction.editReply({
    embeds: [successEmbed("Rankings Recalculated", `Standings have been recalculated from ${data.scores.length} game(s).\n\n${summary}`)],
  });
}

async function cmdUpdateTeamRecord(interaction, data) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can use this command.")], ephemeral: true });
  }

  const role = interaction.options.getRole("role");
  const recordStr = interaction.options.getString("record");

  if (!data.crews[role.id]) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${role} is not a registered crew.`)], ephemeral: true });
  }

  // Parse W-L format
  const recordMatch = recordStr.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!recordMatch) {
    return interaction.reply({ embeds: [errorEmbed("Invalid Format", "Use W-L format, e.g. `6-2`.")], ephemeral: true });
  }

  const wins = parseInt(recordMatch[1]);
  const losses = parseInt(recordMatch[2]);

  const rec = getRecord(data, role.id);
  rec.wins = wins;
  rec.losses = losses;
  // Reset streak since we're manually overriding
  rec.streak = 0;
  rec.streakType = null;

  saveData(data);
  await updateStandingsMessage(interaction.guild, data);

  return interaction.reply({
    embeds: [successEmbed("Record Updated", `**${role.name}** record has been set to **${wins}-${losses}**.`)],
  });
}

// ═══════════════════════════════════════
// PUBLIC COMMANDS
// ═══════════════════════════════════════

async function cmdRoster(interaction, data) {
  const role = interaction.options.getRole("role");
  const crew = data.crews[role.id];

  if (!crew) {
    return interaction.reply({ embeds: [errorEmbed("Not Found", `${role} is not a registered crew.`)], ephemeral: true });
  }

  const owner = `<@${crew.ownerId}>`;
  const captains =
    crew.captains.length > 0
      ? crew.captains.map((id) => `<@${id}>`).join("\n")
      : "*None*";
  const players =
    crew.players.length > 0
      ? crew.players.map((id) => `<@${id}>`).join("\n")
      : "*None*";

  const total = 1 + crew.captains.length + crew.players.length;

  const rosterEmbed = new EmbedBuilder()
    .setTitle(`${role.name} Roster`)
    .setColor(role.color || 0x5865f2)
    .addFields(
      { name: "👑 Franchise Owner", value: owner, inline: false },
      { name: "Captains", value: captains, inline: false },
      { name: "Players", value: players, inline: false },
      { name: "Roster Size", value: `**${total}** player${total !== 1 ? "s" : ""}`, inline: false }
    )
    .setTimestamp();

  return interaction.reply({ embeds: [rosterEmbed] });
}

async function cmdCrews(interaction, data) {
  const crewIds = Object.keys(data.crews);

  if (crewIds.length === 0) {
    return interaction.reply({ embeds: [infoEmbed("No Crews", "No crews have been registered yet.")] });
  }

  let desc = "";
  for (const roleId of crewIds) {
    const crew = data.crews[roleId];
    const role = interaction.guild.roles.cache.get(roleId);
    const total = 1 + crew.captains.length + crew.players.length;
    const roleName = role ? role.name : "Deleted Role";
    desc += `**${roleName}** — ${total} player${total !== 1 ? "s" : ""} · Owner: <@${crew.ownerId}>\n`;
  }

  return interaction.reply({ embeds: [infoEmbed("All Crews", desc)] });
}

async function cmdFreeAgents(interaction, data) {
  await interaction.deferReply();
  await interaction.guild.members.fetch();

  const signedIds = new Set();
  for (const crew of Object.values(data.crews)) {
    signedIds.add(crew.ownerId);
    crew.captains.forEach((id) => signedIds.add(id));
    crew.players.forEach((id) => signedIds.add(id));
  }

  const freeAgents = interaction.guild.members.cache
    .filter((m) => !m.user.bot && !signedIds.has(m.id))
    .map((m) => m.user);

  if (freeAgents.length === 0) {
    return interaction.editReply({ embeds: [infoEmbed("Free Agents", "Everyone is signed to a crew!")] });
  }

  // Cap at 30 to avoid embed limits
  const display = freeAgents.slice(0, 30);
  let desc = display.map((u) => `• <@${u.id}>`).join("\n");
  if (freeAgents.length > 30) {
    desc += `\n\n...and **${freeAgents.length - 30}** more.`;
  }

  return interaction.editReply({
    embeds: [infoEmbed(`Free Agents (${freeAgents.length})`, desc)],
  });
}

async function cmdMyTeam(interaction, data) {
  const result = findUserCrew(data, interaction.user.id);

  if (!result) {
    return interaction.reply({ embeds: [infoEmbed("Free Agent", "You're not on any crew. You're a free agent!")], ephemeral: true });
  }

  const role = interaction.guild.roles.cache.get(result.roleId);
  const rank = getUserRank(result.crew, interaction.user.id);
  const rankLabel =
    rank === "owner" ? "Franchise Owner" : rank === "captain" ? "Captain" : "Player";

  return interaction.reply({
    embeds: [infoEmbed("Your Crew", `**Crew:** ${role?.name || "Unknown"}\n**Your Role:** ${rankLabel}`)],
    ephemeral: true,
  });
}

// ═══════════════════════════════════════
// BUTTON HANDLER (SIGN ACCEPT / REJECT)
// ═══════════════════════════════════════

async function handleButton(interaction) {
  const data = loadData();
  const customId = interaction.customId;

  if (!customId.startsWith("sign_accept_") && !customId.startsWith("sign_reject_")) return;

  const targetId = customId.split("_")[2];

  // Only the invited user can click
  if (interaction.user.id !== targetId) {
    return interaction.reply({ content: "This isn't for you.", ephemeral: true });
  }

  const pending = data.pending[targetId];
  if (!pending) {
    return interaction.update({
      embeds: [errorEmbed("Expired", "This signing offer has expired or was already handled.")],
      components: [],
    });
  }

  // Check if expired (24h)
  if (Date.now() - pending.timestamp > 86400000) {
    delete data.pending[targetId];
    saveData(data);
    return interaction.update({
      embeds: [errorEmbed("Expired", "This signing offer has expired.")],
      components: [],
    });
  }

  const guild = client.guilds.cache.get(pending.guildId);
  const crewRole = guild?.roles.cache.get(pending.crewRoleId);
  const crewName = crewRole?.name || "Unknown Crew";
  const crew = data.crews[pending.crewRoleId];

  if (!crew) {
    delete data.pending[targetId];
    saveData(data);
    return interaction.update({
      embeds: [errorEmbed("Crew Gone", "That crew no longer exists.")],
      components: [],
    });
  }

  // ── ACCEPT ──
  if (customId.startsWith("sign_accept_")) {
    // Double-check they're still a free agent
    const existing = findUserCrew(data, targetId);
    if (existing) {
      delete data.pending[targetId];
      saveData(data);
      return interaction.update({
        embeds: [errorEmbed("Already Signed", "You joined a crew since this offer was sent.")],
        components: [],
      });
    }

    crew.players.push(targetId);
    delete data.pending[targetId];
    saveData(data);

    // Give the role
    if (guild) {
      const member = await guild.members.fetch(targetId).catch(() => null);
      if (member && crewRole) {
        await member.roles.add(crewRole.id).catch(() => {});
      }
    }

    await interaction.update({
      embeds: [successEmbed("Signed", `You are now a member of **${crewName}**. Welcome to the squad.`)],
      components: [],
    });

    // Log the signing
    if (guild) {
      await logTransaction(guild, "SIGN", {
        "Player": `<@${targetId}>`,
        "Crew": crewName,
        "Signed By": `<@${pending.signedBy}>`,
      });
    }

    // Notify the person who sent the invite
    if (guild) {
      const signer = await guild.members.fetch(pending.signedBy).catch(() => null);
      if (signer) {
        signer.send({ embeds: [successEmbed("Signing Accepted", `<@${targetId}> accepted the offer to join **${crewName}**!`)] }).catch(() => {});
      }
    }

    return;
  }

  // ── REJECT ──
  if (customId.startsWith("sign_reject_")) {
    delete data.pending[targetId];
    saveData(data);

    await interaction.update({
      embeds: [infoEmbed("Offer Declined", `You declined the offer to join **${crewName}**.`)],
      components: [],
    });

    // Notify the signer
    if (guild) {
      const signer = await guild.members.fetch(pending.signedBy).catch(() => null);
      if (signer) {
        signer.send({ embeds: [errorEmbed("Signing Rejected", `<@${targetId}> rejected the offer to join **${crewName}**.`)] }).catch(() => {});
      }
    }

    return;
  }
}

// ─── PENDING CLEANUP (every hour, remove expired invites) ───
setInterval(() => {
  const data = loadData();
  let changed = false;
  for (const [userId, p] of Object.entries(data.pending)) {
    if (Date.now() - p.timestamp > 86400000) {
      delete data.pending[userId];
      changed = true;
    }
  }
  if (changed) saveData(data);
}, 3600000);

// ─── LOGIN ───
client.login(TOKEN);