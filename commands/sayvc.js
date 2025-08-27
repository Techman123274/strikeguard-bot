// commands/sayvc.js
"use strict";

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} from "@discordjs/voice";
import discordTTS from "discord-tts";

// Per-guild simple queues
const guildQueues = new Map(); // guildId -> Array<{ text, lang, voiceChannel }>
const players = new Map();     // guildId -> AudioPlayer
const connections = new Map(); // guildId -> VoiceConnection
const TIMEOUT_MS = 30_000;     // leave after 30s idle
const MAX_CHUNK = 180;         // keep chunks small & reliable

const ADMIN_ROLE_IDS = (process.env.ADMIN_ROLE_IDS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function isAuthorized(interaction) {
  // Admins allowed
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

  // Or any of the allowed role IDs from env
  if (ADMIN_ROLE_IDS.length) {
    const memberRoles = interaction.member?.roles?.valueOf?.() || interaction.member?.roles;
    const ids = new Set(memberRoles?.cache ? memberRoles.cache.keys() : memberRoles);
    for (const rid of ADMIN_ROLE_IDS) if (ids.has(rid)) return true;
  }
  return false;
}

function sanitize(s) {
  return s.replace(/<@!?(\d+)>/g, "@$1").replace(/@everyone|@here/g, "@\u200Beveryone");
}

function chunkText(text) {
  const chunks = [];
  let t = text.trim();
  while (t.length > MAX_CHUNK) {
    let cut = t.lastIndexOf(" ", MAX_CHUNK);
    if (cut === -1) cut = MAX_CHUNK;
    chunks.push(t.slice(0, cut));
    t = t.slice(cut).trim();
  }
  if (t) chunks.push(t);
  return chunks;
}

async function ensureConnection(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  let conn = connections.get(guildId);

  if (!conn) {
    conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    connections.set(guildId, conn);
  }

  // If target VC changed, move the connection
  if (conn.joinConfig.channelId !== voiceChannel.id) {
    conn.destroy();
    conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    connections.set(guildId, conn);
  }

  await entersState(conn, VoiceConnectionStatus.Ready, 10_000).catch(() => {
    try { conn.destroy(); } catch {}
    connections.delete(guildId);
    throw new Error("not_ready");
  });

  // Stage channel support
  if (voiceChannel.type === ChannelType.GuildStageVoice) {
    try {
      const me = voiceChannel.guild.members.me;
      if (me?.voice?.suppress) await me.voice.setSuppressed(false).catch(() => {});
      await me?.voice?.setRequestToSpeak?.(true).catch(() => {});
    } catch {}
  }

  return conn;
}

function getOrCreatePlayer(guildId, connection) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
    connection.subscribe(player);
  }
  return player;
}

function scheduleLeave(guildId) {
  const conn = connections.get(guildId);
  if (!conn) return;
  clearTimeout(conn._byeTimer);
  conn._byeTimer = setTimeout(() => {
    try { players.get(guildId)?.stop(); } catch {}
    try { conn.destroy(); } catch {}
    players.delete(guildId);
    connections.delete(guildId);
  }, TIMEOUT_MS);
}

async function processQueue(guildId) {
  const queue = guildQueues.get(guildId) || [];
  if (queue._processing) return;
  queue._processing = true;

  while (queue.length) {
    const item = queue.shift();
    if (!item) break;

    const { voiceChannel, lang, text } = item;
    let connection;
    try {
      connection = await ensureConnection(voiceChannel);
    } catch {
      continue; // failed to join, drop this item
    }
    const player = getOrCreatePlayer(guildId, connection);

    // speak chunks sequentially
    const chunks = chunkText(text);
    for (const c of chunks) {
      const stream = discordTTS.getVoiceStream(c, { lang });
      const resource = createAudioResource(stream);
      player.play(resource);

      await new Promise((resolve) => {
        const onIdle = () => {
          player.off("error", onErr);
          resolve();
        };
        const onErr = () => {
          player.off(AudioPlayerStatus.Idle, onIdle);
          resolve();
        };
        player.once(AudioPlayerStatus.Idle, onIdle);
        player.once("error", onErr);
      });
    }

    scheduleLeave(guildId);
  }

  queue._processing = false;
}

export default {
  data: new SlashCommandBuilder()
    .setName("sayvc")
    .setDescription("Make the bot speak in a selected voice channel (admin only).")
    .addStringOption(opt =>
      opt.setName("message")
        .setDescription("What should the bot say?")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("lang")
        .setDescription("Voice language code (e.g., en, en-US, es, fr)")
        .setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName("channel")
        .setDescription("Which voice channel should the bot join?")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    )
    // UI gate at the permission level:
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    // Runtime gate (in case perms changed or you want role-based access)
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: "❌ Admin only.", ephemeral: true });
    }

    const pickedChannel = interaction.options.getChannel("channel");
    const member = interaction.member;
    const fallbackVC = member?.voice?.channel || null;

    // Choose channel: provided option OR caller’s current VC
    const voiceChannel = pickedChannel || fallbackVC;
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ Choose a **channel** option or join a voice channel first.",
        ephemeral: true
      });
    }

    const raw = interaction.options.getString("message", true).slice(0, 1000);
    const text = sanitize(raw);
    const lang = interaction.options.getString("lang") || "en";
    const guildId = interaction.guild.id;

    // Permission sanity check for the bot in that channel
    const me = interaction.guild.members.me;
    const perms = voiceChannel.permissionsFor?.(me);
    if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
      return interaction.reply({
        content: "❌ I need **Connect** and **Speak** in that channel.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: `🗣️ Queued for **${voiceChannel.name}**.`,
      ephemeral: true
    });

    // enqueue
    const queue = guildQueues.get(guildId) || [];
    queue.push({ voiceChannel, lang, text });
    guildQueues.set(guildId, queue);

    processQueue(guildId).catch(() => {});
  }
};
