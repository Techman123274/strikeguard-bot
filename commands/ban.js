import {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import Log from '../models/Log.js';
import config from '../config.js';

function parseDuration(input) {
  const match = input.match(/(\d+)([smhd])/); // seconds, minutes, hours, days
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return value * (multipliers[unit] || 0);
}

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user with optional duration and logging.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You do not have permission.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');

    const modal = new ModalBuilder()
      .setCustomId(`ban_reason_modal_${target.id}`)
      .setTitle(`Ban ${target.tag}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for ban')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel('Duration (e.g. 30m, 2h, leave blank for permanent)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(reasonInput),
      new ActionRowBuilder().addComponents(durationInput)
    );

    await interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    const targetId = interaction.customId.split('_').pop();
    const reason = interaction.fields.getTextInputValue('reason');
    const durationText = interaction.fields.getTextInputValue('duration');
    const durationMs = parseDuration(durationText);
    const target = await interaction.client.users.fetch(targetId);

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_ban_${target.id}`)
        .setLabel('✅ Confirm Ban')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel_ban`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    interaction.client._banQueue ??= {};
    interaction.client._banQueue[target.id] = {
      moderator: interaction.user,
      reason,
      durationMs,
      channelId: interaction.channel.id,
      durationText
    };

    await interaction.reply({
      content: `Do you want to ban <@${target.id}>?\n\n**Reason:** ${reason}\n**Duration:** ${durationText || 'Permanent'}`,
      components: [confirmRow],
      ephemeral: true
    });
  },

  async handleButton(interaction) {
    const [action, , userId] = interaction.customId.split('_');
    const banData = interaction.client._banQueue?.[userId];
    if (!banData) return interaction.reply({ content: '⚠️ Ban session expired or missing.', ephemeral: true });

    const target = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!target) return interaction.reply({ content: '❌ User is not in the server.', ephemeral: true });

    if (action === 'cancel') {
      delete interaction.client._banQueue[userId];
      return interaction.reply({ content: '❌ Ban cancelled.', ephemeral: true });
    }

    if (action === 'confirm') {
      let dmSent = false;

      try {
        await target.send(`⛔ You have been banned from **${interaction.guild.name}**.\n\n**Reason:** ${banData.reason}\n**Duration:** ${banData.durationText || 'Permanent'}`);
        dmSent = true;
      } catch {}

      await target.ban({ reason: banData.reason });

      // Schedule unban
      if (banData.durationMs) {
        setTimeout(async () => {
          try {
            await interaction.guild.members.unban(userId, 'Ban expired (auto-unban)');
          } catch {}
        }, banData.durationMs);
      }

      await Log.create({
        type: 'ban',
        data: {
          userId,
          moderatorId: banData.moderator.id,
          reason: banData.reason,
          duration: banData.durationText || 'Permanent',
          timestamp: new Date(),
          channelId: banData.channelId,
          dmSent
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('⛔ User Banned')
        .setColor('DarkRed')
        .addFields(
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${banData.moderator.id}>`, inline: true },
          { name: 'Channel', value: `<#${banData.channelId}>` },
          { name: 'Reason', value: banData.reason },
          { name: 'Duration', value: banData.durationText || 'Permanent' },
          { name: 'DM Sent?', value: dmSent ? '✅ Yes' : '❌ No' }
        )
        .setTimestamp();

      interaction.client.channels.cache.get(config.logChannelId)?.send({ embeds: [embed] });

      delete interaction.client._banQueue[userId];

      await interaction.reply({ content: `✅ <@${userId}> has been banned.`, ephemeral: true });
    }
  }
};
