// commands/sound.js
"use strict";

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  demuxProbe
} from "@discordjs/voice";
import { Readable } from "stream";
import Sound from "../models/Sound.js";

async function ensureVC(voiceChannel) {
  const guildId = voiceChannel.guild.id;
  let conn = getVoiceConnection(guildId);
  if (!conn) {
    conn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
  }
  await entersState(conn, VoiceConnectionStatus.Ready, 10_000);
  return conn;
}

async function streamFromUrl(url) {
  // Uses global fetch (Node 18+) and converts WebStream -> Node stream
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Fetch failed: ${res.status}`);
  return Readable.fromWeb(res.body);
}

export default {
  data: new SlashCommandBuilder()
    .setName("sound")
    .setDescription("Admin soundboard: add, play, list, remove custom VC clips.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc =>
      sc.setName("add")
        .setDescription("Add a sound by URL or attachment")
        .addStringOption(o =>
          o.setName("name").setDescription("Unique name").setRequired(true)
        )
        .addStringOption(o =>
          o.setName("url").setDescription("Direct audio URL (mp3/ogg/wav)").setRequired(false)
        )
        .addAttachmentOption(o =>
          o.setName("file").setDescription("Upload an audio file").setRequired(false)
        )
    )
    .addSubcommand(sc =>
      sc.setName("play")
        .setDescription("Play a sound in a voice channel")
        .addStringOption(o =>
          o.setName("name").setDescription("Name of the sound").setRequired(true)
        )
        .addChannelOption(o =>
          o.setName("channel")
            .setDescription("VC to join (defaults to your VC)")
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
    )
    .addSubcommand(sc =>
      sc.setName("list")
        .setDescription("List all sounds")
    )
    .addSubcommand(sc =>
      sc.setName("remove")
        .setDescription("Remove a sound")
        .addStringOption(o =>
          o.setName("name").setDescription("Name to remove").setRequired(true)
        )
    ),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === "add") {
      const name = interaction.options.getString("name", true).toLowerCase();
      let url = interaction.options.getString("url") || null;
      const file = interaction.options.getAttachment("file") || null;

      if (!url && !file) {
        return interaction.reply({ content: "❌ Provide a `url` or an audio `file`.", ephemeral: true });
      }
      if (file) {
        // Basic check: let’s allow common audio types
        const okTypes = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm"];
        if (file.contentType && !okTypes.includes(file.contentType)) {
          return interaction.reply({ content: "❌ Unsupported file type.", ephemeral: true });
        }
        url = file.url;
      }

      try {
        await Sound.create({
          guildId,
          name,
          url,
          addedBy: interaction.user.id
        });
        return interaction.reply({ content: `✅ Added **${name}**`, ephemeral: true });
      } catch (e) {
        if (e.code === 11000) {
          return interaction.reply({ content: "❌ A sound with that name already exists.", ephemeral: true });
        }
        console.error(e);
        return interaction.reply({ content: "❌ Failed to add sound.", ephemeral: true });
      }
    }

    if (sub === "list") {
      const items = await Sound.find({ guildId }).sort({ name: 1 }).lean();
      if (!items.length) {
        return interaction.reply({ content: "ℹ️ No sounds saved yet.", ephemeral: true });
      }
      const names = items.map(s => s.name).join(", ");
      return interaction.reply({ content: `🎛️ **Sounds:** ${names}`, ephemeral: true });
    }

    if (sub === "remove") {
      const name = interaction.options.getString("name", true).toLowerCase();
      const res = await Sound.findOneAndDelete({ guildId, name });
      if (!res) {
        return interaction.reply({ content: "❌ Not found.", ephemeral: true });
      }
      return interaction.reply({ content: `🗑️ Removed **${name}**`, ephemeral: true });
    }

    if (sub === "play") {
      const name = interaction.options.getString("name", true).toLowerCase();
      const record = await Sound.findOne({ guildId, name }).lean();
      if (!record) {
        return interaction.reply({ content: "❌ Sound not found.", ephemeral: true });
      }

      // Choose VC: provided channel or caller’s current VC
      const picked = interaction.options.getChannel("channel");
      const userVC = interaction.member?.voice?.channel || null;
      const voiceChannel = picked || userVC;
      if (!voiceChannel) {
        return interaction.reply({ content: "❌ Join a VC or provide the `channel` option.", ephemeral: true });
      }

      // Bot perms
      const me = interaction.guild.members.me;
      const perms = voiceChannel.permissionsFor?.(me);
      if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
        return interaction.reply({ content: "❌ I need **Connect** and **Speak** in that channel.", ephemeral: true });
      }

      await interaction.reply({ content: `▶️ Playing **${name}** in **${voiceChannel.name}**`, ephemeral: true });

      // Join & play
      try {
        const conn = await ensureVC(voiceChannel);
        const fileStream = await streamFromUrl(record.url);

        // Let @discordjs/voice detect container/codec
        const { stream, type } = await demuxProbe(fileStream);
        const resource = createAudioResource(stream, { inputType: type });

        const player = createAudioPlayer();
        conn.subscribe(player);
        player.play(resource);

        player.once(AudioPlayerStatus.Idle, () => {
          try { player.stop(); } catch {}
          // Optional: conn.destroy(); // leave after each sound
        });

        player.once("error", (err) => {
          console.error("Sound play error:", err);
        });
      } catch (e) {
        console.error(e);
        return interaction.editReply({ content: "⚠️ Could not play that sound (bad URL/file?).", ephemeral: true });
      }
    }
  }
};
