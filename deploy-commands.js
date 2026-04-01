const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv/config");

// ─── REPLACE THESE OR USE .env ───
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID; // your TFW server ID

const commands = [
  // ══════ STAFF COMMANDS ══════
  new SlashCommandBuilder()
    .setName("addcrew")
    .setDescription("(Staff) Register a role as a crew")
    .addRoleOption((o) =>
      o.setName("role").setDescription("The crew role").setRequired(true)
    )
    .addUserOption((o) =>
      o
        .setName("owner")
        .setDescription("The franchise owner of this crew")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removecrew")
    .setDescription("(Staff) Unregister a crew")
    .addRoleOption((o) =>
      o.setName("role").setDescription("The crew role to remove").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setowner")
    .setDescription("(Staff) Change a crew's franchise owner")
    .addRoleOption((o) =>
      o.setName("role").setDescription("The crew role").setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The new owner").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("forcesign")
    .setDescription("(Staff) Force-sign a user to a crew without a DM invite")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to sign").setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("The crew role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("forcerelease")
    .setDescription("(Staff) Force-release a user from their crew")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to release").setRequired(true)
    ),

  // ══════ OWNER / CAPTAIN COMMANDS ══════
  new SlashCommandBuilder()
    .setName("sign")
    .setDescription("(Owner/Captain) Invite a free agent to your crew")
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to sign").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("(Owner/Captain) Release a player from your crew")
    .addUserOption((o) =>
      o.setName("user").setDescription("The player to release").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("(Owner) Promote a player to captain")
    .addUserOption((o) =>
      o.setName("user").setDescription("The player to promote").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("demote")
    .setDescription("(Owner) Demote a captain to player")
    .addUserOption((o) =>
      o.setName("user").setDescription("The captain to demote").setRequired(true)
    ),

  // ══════ MEMBER COMMANDS ══════
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Leave your current crew"),

  new SlashCommandBuilder()
    .setName("disband")
    .setDescription("(Owner) Disband your crew and delete the role"),

  // ══════ STAFF - STANDINGS ══════
  new SlashCommandBuilder()
    .setName("startperiod")
    .setDescription("(Staff) Start a new standings period and reset all records")
    .addStringOption((o) =>
      o.setName("name").setDescription("Period name (e.g. Season 1, Week 3)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("forceupdaterankings")
    .setDescription("(Staff) Re-read all scores in the current period and recalculate standings"),

  new SlashCommandBuilder()
    .setName("updateteamrecord")
    .setDescription("(Staff) Manually set a crew's record")
    .addRoleOption((o) =>
      o.setName("role").setDescription("The crew role").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("record").setDescription("Record in W-L format (e.g. 6-2)").setRequired(true)
    ),

  // ══════ PUBLIC COMMANDS ══════
  new SlashCommandBuilder()
    .setName("roster")
    .setDescription("View a crew's roster")
    .addRoleOption((o) =>
      o.setName("role").setDescription("The crew role").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("crews")
    .setDescription("List all registered crews"),

  new SlashCommandBuilder()
    .setName("freeagents")
    .setDescription("List all players not on any crew"),

  new SlashCommandBuilder()
    .setName("myteam")
    .setDescription("Check which crew you're on"),
].map((c) => c.toJSON());

const rest = new REST().setToken(TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} commands to guild ${GUILD_ID}...`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("Commands deployed successfully!");
  } catch (err) {
    console.error(err);
  }
})();