// events/interactionCreate.selfroles.js
import { Events, MessageFlags, PermissionFlagsBits } from "discord.js";

/**
 * Self-roles interaction handler (buttons + select menus)
 * - Acknowledges ONCE (deferUpdate or update) → then uses followUp() for feedback
 * - Ignores stale/expired interactions without crashing
 * - Tolerant to double-calls (multiple listeners or logic branches)
 * - Shows clear ephemeral status to users
 *
 * Expected customIds created by your command:
 *  - StringSelectMenu:  selfroles:<guildId>:<version>
 *  - Buttons:           selfroles:refresh:<guildId>:<version>
 *                       selfroles:delete:<guildId>:<version>
 */

export default (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    // Quick exit if not our stuff
    const isMenu = interaction.isStringSelectMenu();
    const isBtn  = interaction.isButton();
    if (!isMenu && !isBtn) return;

    const id = interaction.customId || "";
    if (!id.startsWith("selfroles:")) return;

    // ---------- Helpers ----------
    const ackOnce = async () => {
      if (!interaction.deferred && !interaction.replied) {
        // For component interactions, prefer deferUpdate()
        await interaction.deferUpdate().catch(() => {});
      }
    };

    const safeFollowUp = async (data) => {
      // Send ephemeral feedback after defer/update
      try {
        return await interaction.followUp({ flags: MessageFlags.Ephemeral, ...data });
      } catch {
        // If somehow it was already replied → ignore
        return null;
      }
    };

    const parseCustomId = () => {
      // selfroles:<...> (menu)
      // selfroles:refresh:<...> (button)
      // selfroles:delete:<...>  (button)
      const parts = id.split(":"); // ["selfroles", "refresh?"|<guildId>, <guildId or version>, <version>?]
      if (parts[1] === "refresh" || parts[1] === "delete") {
        return { kind: "button", action: parts[1], guildId: parts[2], version: parts[3] };
      }
      // menu: selfroles:<guildId>:<version>
      return { kind: "menu", action: "toggle", guildId: parts[1], version: parts[2] };
    };

    // Optional: role management safety
    const botCanManage = (role, me) => {
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
      return me.roles.highest.comparePositionTo(role) > 0;
    };

    // ---------- Handler ----------
    try {
      const meta = parseCustomId();

      // Defensive: reject cross-guild clicks (very rare)
      if (meta.guildId && interaction.guildId !== meta.guildId) {
        await ackOnce();
        await safeFollowUp({ content: "This control is for another server and can’t be used here." });
        return;
      }

      if (meta.kind === "menu") {
        // ==== SELECT MENU: toggle roles ====
        await ackOnce();

        // Values are the selected role IDs to toggle
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();

        const roleIds = interaction.values || [];
        const results = [];

        for (const roleId of roleIds) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (!role) {
            results.push(`❓ <@&${roleId}> (missing)`);
            continue;
          }
          if (!botCanManage(role, me)) {
            results.push(`⚠️ <@&${roleId}> (I can’t manage this role)`);
            continue;
          }

          const has = member.roles.cache.has(roleId);
          try {
            if (has) {
              await member.roles.remove(roleId, "Self-roles: toggle off");
              results.push(`➖ <@&${roleId}>`);
            } else {
              await member.roles.add(roleId, "Self-roles: toggle on");
              results.push(`➕ <@&${roleId}>`);
            }
          } catch (e) {
            results.push(`⚠️ <@&${roleId}> (failed to modify)`);
          }
        }

        await safeFollowUp({
          content: results.length ? results.join("\n") : "No changes."
        });
        return;
      }

      if (meta.kind === "button") {
        // ==== BUTTONS: refresh/delete admin controls ====
        // Your current panel logic lives in the slash command code.
        // Here we just acknowledge and give an instruction or soft action.
        await ackOnce();

        if (meta.action === "refresh") {
          // If you later expose a programmatic refresh, call it here.
          await safeFollowUp({ content: "✅ Use `/selfroles publish` to refresh the panel." });
          return;
        }

        if (meta.action === "delete") {
          // You can choose to delete the message that hosts the panel (if the bot has perms)
          // or just guide the admin.
          const msg = interaction.message;
          const canDelete = msg?.deletable;
          if (canDelete) {
            await msg.delete().catch(() => {});
            await safeFollowUp({ content: "🗑️ Panel message deleted. Run `/selfroles publish` to post a new one." });
          } else {
            await safeFollowUp({ content: "I couldn’t delete that message. Check my permissions, or delete it manually." });
          }
          return;
        }
      }
    } catch (err) {
      // ---- Known noisy errors we can safely ignore ----
      if (err?.code === 10062 /* Unknown interaction (stale) */) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "This control is outdated. Use `/selfroles publish` to refresh the panel.",
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        }
        return;
      }

      if (
        err?.code === 40060 /* already acknowledged */ ||
        err?.code === "InteractionAlreadyReplied"
      ) {
        // Another branch already replied; ignore.
        return;
      }

      console.error("❌ Interaction error (selfroles):", err);
      // Try a last-chance ephemeral note if possible
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Something went wrong handling that control.",
            flags: MessageFlags.Ephemeral
          });
        }
      } catch {}
    }
  });
};
