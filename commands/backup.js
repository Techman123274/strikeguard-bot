"use strict";

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
  ChannelType,
  OverwriteType
} from "discord.js";
import JSZip from "jszip";

// ---------- Helper ----------
function sanitizeFilename(name) {
  return (name || "server")
    .replace(/[\\/:"*?<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

// ---------- Backup Builder ----------
async function buildGuildBackupZip(guild, actingUser) {
  await Promise.allSettled([
    guild.roles.fetch(),
    guild.channels.fetch(),
    guild.emojis.fetch(),
    guild.stickers.fetch()
  ]);

  const toPermOverwrites = (overwrites) =>
    overwrites?.map((ow) => ({
      id: ow.id,
      type: ow.type === OverwriteType.Role ? "role" : "member",
      allow: ow.allow.bitfield.toString(),
      deny: ow.deny.bitfield.toString(),
    })) || [];

  const channelBase = (ch) => ({
    id: ch.id,
    type: ch.type,
    name: ch.name ?? null,
    parentId: ch.parentId ?? null,
    position: ch.rawPosition ?? null,
    topic: "topic" in ch ? ch.topic ?? null : null,
    nsfw: "nsfw" in ch ? !!ch.nsfw : null,
    rateLimitPerUser: "rateLimitPerUser" in ch ? ch.rateLimitPerUser ?? 0 : null,
    bitrate: "bitrate" in ch ? ch.bitrate ?? null : null,
    userLimit: "userLimit" in ch ? ch.userLimit ?? null : null,
    rtcRegion: "rtcRegion" in ch ? ch.rtcRegion ?? null : null,
    permissionOverwrites: toPermOverwrites(ch.permissionOverwrites?.cache?.toJSON?.() || []),
  });

  // Meta
  const meta = {
    id: guild.id,
    name: guild.name,
    ownerId: guild.ownerId,
    createdTimestamp: guild.createdTimestamp,
    backedUpAt: Date.now(),
    requestedBy: actingUser ? { id: actingUser.id, tag: actingUser.tag } : null,
  };

  // Roles
  const roles = guild.roles.cache.map(r => ({
    id: r.id,
    name: r.name,
    position: r.position,
    color: r.hexColor,
    permissions: r.permissions.bitfield.toString(),
    mentionable: r.mentionable,
  }));

  // Channels
  const channels = guild.channels.cache
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map(ch => channelBase(ch));

  // Emojis
  const emojis = guild.emojis.cache.map(e => ({
    id: e.id,
    name: e.name,
    animated: e.animated,
    url: e.url
  }));

  // Stickers
  const stickers = guild.stickers.cache.map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    format: s.format,
  }));

  // Invites
  let invites = [];
  try {
    const fetched = await guild.invites.fetch();
    invites = fetched.map(i => ({
      code: i.code,
      channelId: i.channelId,
      inviterId: i.inviterId ?? null,
      uses: i.uses,
      maxUses: i.maxUses,
      maxAge: i.maxAge,
    }));
  } catch {
    invites = [{ note: "Could not fetch invites (need MANAGE_GUILD)" }];
  }

  // Bans
  let bans = [];
  try {
    const fetched = await guild.bans.fetch();
    bans = fetched.map(b => ({
      userId: b.user.id,
      reason: b.reason ?? null,
    }));
  } catch {
    bans = [{ note: "Could not fetch bans (need BAN_MEMBERS)" }];
  }

  // Build JSON
  const backupJson = {
    meta,
    roles,
    channels,
    emojis,
    stickers,
    invites,
    bans,
    notes: ["Messages & attachments cannot be exported by Discord API."]
  };

  // Build ZIP
  const zip = new JSZip();
  zip.file("backup.json", JSON.stringify(backupJson, null, 2));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const filename = `${sanitizeFilename(guild.name)}_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;

  return new AttachmentBuilder(buf, { name: filename });
}

// ---------- Command ----------
export default {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Create a full server backup archive (roles, channels, emojis, etc.)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const attachment = await buildGuildBackupZip(interaction.guild, interaction.user);

      await interaction.editReply({
        content: `✅ Backup complete for **${interaction.guild.name}**`,
        files: [attachment]
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Backup failed. Check console.");
    }
  }
};
