import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import config from '../config.js';
import Log from '../models/Log.js';

export default {
  data: new SlashCommandBuilder()
    .setName('modpanel')
    .setDescription('Open an interactive moderation panel for a user.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to moderate')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You don’t have permission.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');

    const embed = new EmbedBuilder()
      .setTitle(`🔧 Moderation Panel`)
      .setDescription(`Take action on <@${target.id}>`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})`, inline: false }
      )
      .setColor('Blurple')
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mod_warn_${target.id}`).setLabel('⚠️ Warn').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`mod_kick_${target.id}`).setLabel('👢 Kick').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mod_mute_${target.id}`).setLabel('🔇 Mute').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`mod_ban_${target.id}`).setLabel('🔨 Ban').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`mod_note_${target.id}`).setLabel('📝 Note').setStyle(ButtonStyle.Success)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mod_history_${target.id}`).setLabel('📖 View History').setStyle(ButtonStyle.Secondary)
    );

    // 🧾 Log to MongoDB
    await Log.create({
      type: 'modpanel_opened',
      data: {
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        channelId: interaction.channel.id,
        timestamp: new Date()
      }
    });

    // 📤 Log to logs channel
    const logEmbed = new EmbedBuilder()
      .setTitle('📟 Mod Panel Opened')
      .setColor('Blue')
      .addFields(
        { name: 'User', value: `<@${target.id}> (${target.tag})`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: false }
      )
      .setTimestamp();

    const logChannel = interaction.client.channels.cache.get(config.logChannelId);
    if (logChannel) {
      logChannel.send({ embeds: [logEmbed] });
    }

    // 🎛️ Respond with the panel
    await interaction.reply({
      embeds: [embed],
      components: [row, row2],
      ephemeral: true
    });
  }
};
