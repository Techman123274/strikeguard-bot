// events/interactionCreate.js
"use strict";

import { MessageFlags, ComponentType } from "discord.js";
import { getLockdown } from "../utils/lockdown.js";
import config from "../config.js";

// Commands allowed to run while locked (for devs to manage state, optional health check)
const ALLOW_WHILE_LOCKED = new Set(["lockdown", "unlock", "status"]);

// ---- helpers ---------------------------------------------------------------

function splitId(id = "") {
  // supports ":" and "_" as separators
  return id.split(/[:_]/g).map(s => s.trim()).filter(Boolean);
}

function nameFromCustomId(customId = "") {
  // "mod_warn_123" -> "warn"
  // "warn_reason_modal:123" -> "warn"
  const parts = splitId(customId);
  if (parts[0] === "mod") return parts[1] || null;
  // map common modal/button prefixes to base commands
  if (parts[0]?.startsWith("warn")) return "warn";
  return parts[0] || null;
}

async function isDevMember(interaction) {
  if (interaction.user?.id === config.ownerId) return true;
  if (!interaction.inGuild()) return false;
  const me = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return !!(me && config.devRoleId && me.roles.cache.has(config.devRoleId));
}

// Ack component interactions once (buttons/menus) ASAP.
async function ackComponentOnce(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {}); // acknowledge without changing the message
  }
}

// Safe ephemeral feedback after ack
async function safeFollowUp(interaction, data) {
  try {
    return await interaction.followUp({ flags: MessageFlags.Ephemeral, ...data });
  } catch {
    return null;
  }
}

// ---- router ----------------------------------------------------------------

export default (client) => {
  client.on("interactionCreate", async (interaction) => {
    try {
      // -------- global lockdown gate (blocks everything for non-devs) -------
      const locked = await getLockdown();
      const dev = await isDevMember(interaction);

      // Determine which command would run (for components/modals)
      let wouldRun = null;
      if (interaction.isChatInputCommand()) {
        wouldRun = interaction.commandName;
      } else if (interaction.isModalSubmit() || interaction.isButton() || interaction.isAnySelectMenu?.()) {
        wouldRun = nameFromCustomId(interaction.customId);
      }

      if (locked && !dev && wouldRun && !ALLOW_WHILE_LOCKED.has(wouldRun)) {
        // For components, ack first to avoid 10062; for slash, reply is fine
        if (interaction.isButton() || interaction.isAnySelectMenu?.()) {
          await ackComponentOnce(interaction);
          await safeFollowUp(interaction, { content: "🛠️ The bot is in **maintenance mode** right now." });
        } else {
          await interaction.reply({
            content: "🛠️ The bot is in **maintenance mode** right now.",
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
        return;
      }

      // ------------------------ SLASH COMMANDS ------------------------------
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command?.execute) return;

        // Subcommand helpers (optional)
        interaction._sub = {
          group: interaction.options.getSubcommandGroup(false),
          name: interaction.options.getSubcommand(false),
        };

        await command.execute(interaction, client);
        return;
      }

      // -------------------------- AUTOCOMPLETE ------------------------------
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          try { await command.autocomplete(interaction, client); } catch (e) {
            console.error("autocomplete error:", e);
          }
        }
        return;
      }

      // ----------------------------- MODALS ---------------------------------
      if (interaction.isModalSubmit()) {
        const commandName = nameFromCustomId(interaction.customId);
        const command = commandName ? client.commands.get(commandName) : null;

        if (command?.handleModalSubmit) {
          await command.handleModalSubmit(interaction, client);
        } else {
          await interaction.reply({
            content: "❌ This modal isn’t wired to a handler.",
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      // ---------------------------- BUTTONS ---------------------------------
      if (interaction.isButton()) {
        const parts = splitId(interaction.customId);

        // ACK ASAP to avoid 10062 if any async work follows
        await ackComponentOnce(interaction);

        // MOD PANEL pattern: mod_<action>_<userId>
        if (parts[0] === "mod") {
          const action = parts[1];
          const userId = parts[2];
          const command = client.commands.get(action);

          if (!command?.execute) {
            await safeFollowUp(interaction, { content: "❌ This moderation action is not available." });
            return;
          }

          const fetchedUser = await interaction.client.users.fetch(userId).catch(() => null);
          if (!fetchedUser) {
            await safeFollowUp(interaction, { content: "❌ Could not resolve the target user." });
            return;
          }

          // temporary options shim
          const originalOptions = interaction.options;
          interaction.options = {
            getUser: () => fetchedUser,
            getString: originalOptions?.getString?.bind(originalOptions) ?? (() => null),
            getInteger: originalOptions?.getInteger?.bind(originalOptions) ?? (() => null),
            getBoolean: originalOptions?.getBoolean?.bind(originalOptions) ?? (() => null),
          };

          await command.execute(interaction, client).finally(() => {
            interaction.options = originalOptions; // restore
          });

          return;
        }

        // Command-specific buttons: "<action>_<...>" or "<action>:<...>"
        const action = parts[0];
        const command = client.commands.get(action);
        if (command?.handleButton) {
          await command.handleButton(interaction, client);
        } else {
          await safeFollowUp(interaction, { content: "❌ This button isn’t wired to a handler." });
        }
        return;
      }

      // ------------------------- SELECT MENUS -------------------------------
      if (interaction.isAnySelectMenu?.() || interaction.componentType === ComponentType.StringSelect) {
        // ACK ASAP for menus as well
        await ackComponentOnce(interaction);

        const action = nameFromCustomId(interaction.customId);
        const command = action ? client.commands.get(action) : null;

        if (command?.handleSelect) {
          await command.handleSelect(interaction, client);
        } else {
          await safeFollowUp(interaction, { content: "❌ This selection isn’t wired to a handler." });
        }
        return;
      }

    } catch (err) {
      // ---- Known noisy errors we can safely ignore/soft-handle ----
      if (err?.code === 10062 /* Unknown interaction (stale / not ack'd in time) */) {
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "This control is outdated. Use `/selfroles publish` to refresh the panel.",
              flags: MessageFlags.Ephemeral
            });
          }
        } catch {}
        return;
      }

      if (err?.code === 40060 /* already acknowledged */ || err?.code === "InteractionAlreadyReplied") {
        // Another branch already responded; ignore.
        return;
      }

      console.error("❌ Interaction error:", err);
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "An error occurred while handling that interaction.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "An error occurred while handling that interaction.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch { /* ignore secondary failures */ }
    }
  });
};
