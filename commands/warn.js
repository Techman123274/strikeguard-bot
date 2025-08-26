import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import Log from '../models/Log.js';
import Strike from '../models/Strike.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user and log the reason.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to warn')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You don’t have permission to use this.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');

    const modal = new ModalBuilder()
      .setCustomId(`warn_reason_modal_${targetUser.id}`)
      .setTitle(`Warn ${targetUser.tag}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for warning')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    const targetId = interaction.customId.split('_').pop();
    const reason = interaction.fields.getTextInputValue('reason');
    const target = await interaction.client.users.fetch(targetId);

    const warnData = {
      moderator: {
        tag: interaction.user.tag,
        id: interaction.user.id
      },
      user: {
        tag: target.tag,
        id: target.id
      },
      reason,
      timestamp: new Date(),
      channelId: interaction.channel.id
    };

    // Save to Mongo
    await Log.create({ type: 'warn', data: warnData });

    // Optional: Add as a strike too
    await Strike.create({
      userId: target.id,
      reason,
      approved: true
    });

    // DM user
    try {
      await target.send(`⚠️ You have received a warning in **${interaction.guild.name}**:\n\n**Reason:** ${reason}`);
    } catch (err) {
      warnData.dmFailed = true;
    }

    // Log Embed
    const embed = new EmbedBuilder()
      .setTitle('⚠️ User Warned')
      .addFields(
        { name: 'User', value: `<@${target.id}> (${target.id})` },
        { name: 'Moderator', value: `<@${interaction.user.id}>` },
        { name: 'Reason', value: reason },
        { name: 'Channel', value: `<#${interaction.channel.id}>` }
      )
      .setColor('Orange')
      .setTimestamp();

    if (warnData.dmFailed) {
      embed.addFields({ name: 'Note', value: '❌ Could not DM user (DMs off).' });
    }

    interaction.client.channels.cache.get(config.logChannelId)?.send({ embeds: [embed] });

    await interaction.reply({ content: `✅ <@${target.id}> has been warned.`, ephemeral: true });
  }
};
