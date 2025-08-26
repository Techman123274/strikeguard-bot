import {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder, ComponentType
} from 'discord.js';
import Log from '../models/Log.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user with confirmation and full logs.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to kick')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You don’t have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const modal = new ModalBuilder()
      .setCustomId(`kick_reason_modal_${target.id}`)
      .setTitle(`Kick ${target.tag}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for kick')
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

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_kick_${target.id}`)
        .setLabel('✅ Confirm & Kick')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel_kick`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const dmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dm_kick_${target.id}`)
        .setLabel('📩 DM User Before Kick')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`nodm_kick_${target.id}`)
        .setLabel('🙈 No DM')
        .setStyle(ButtonStyle.Secondary)
    );

    // Save data for later
    interaction.client._kickQueue ??= {};
    interaction.client._kickQueue[target.id] = {
      moderator: interaction.user,
      reason,
      channelId: interaction.channel.id
    };

    await interaction.reply({
      content: `How would you like to proceed with <@${target.id}>?\n\nReason: **${reason}**`,
      components: [dmRow, confirmRow],
      ephemeral: true
    });
  },

  async handleButton(interaction) {
    const [action, , userId] = interaction.customId.split('_');
    const kickData = interaction.client._kickQueue?.[userId];
    if (!kickData) return interaction.reply({ content: '⚠️ Kick data expired or missing.', ephemeral: true });

    const target = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!target) return interaction.reply({ content: '❌ User is no longer in the server.', ephemeral: true });

    let dmSent = false;

    if (action === 'dm') {
      try {
        await target.send(`🚨 You have been kicked from **${interaction.guild.name}**.\n\n**Reason:** ${kickData.reason}`);
        dmSent = true;
      } catch (err) {
        dmSent = false;
      }

      return interaction.reply({ content: dmSent ? '📨 DM sent.' : '⚠️ Could not DM user.', ephemeral: true });
    }

    if (action === 'nodm') {
      return interaction.reply({ content: '🙈 User will not be DM’d.', ephemeral: true });
    }

    if (action === 'confirm') {
      await target.kick(kickData.reason).catch(err => {
        console.error(err);
        return interaction.reply({ content: '❌ Failed to kick the user.', ephemeral: true });
      });

      // Log to Mongo
      await Log.create({
        type: 'kick',
        data: {
          userId: userId,
          moderatorId: kickData.moderator.id,
          reason: kickData.reason,
          dmSent,
          timestamp: new Date(),
          channelId: kickData.channelId
        }
      });

      // Log to channel
      const embed = new EmbedBuilder()
        .setTitle('🚫 User Kicked')
        .setColor('Red')
        .addFields(
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'By', value: `<@${kickData.moderator.id}>`, inline: true },
          { name: 'Channel', value: `<#${kickData.channelId}>` },
          { name: 'Reason', value: kickData.reason },
          { name: 'DM Sent?', value: dmSent ? '✅ Yes' : '❌ No' }
        )
        .setTimestamp();

      interaction.client.channels.cache.get(config.logChannelId)?.send({ embeds: [embed] });

      delete interaction.client._kickQueue[userId];

      return interaction.reply({ content: `✅ <@${userId}> has been kicked.`, ephemeral: true });
    }

    if (action === 'cancel') {
      delete interaction.client._kickQueue[userId];
      return interaction.reply({ content: '❌ Kick canceled.', ephemeral: true });
    }
  }
};
