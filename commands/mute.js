import {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder
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
    .setName('mute')
    .setDescription('Mute a user with duration and reason')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to mute')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You do not have permission.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');

    const modal = new ModalBuilder()
      .setCustomId(`mute_modal_${target.id}`)
      .setTitle(`Mute ${target.tag}`);

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for mute')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel('Duration (e.g. 15m, 2h, 1d)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

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

    if (!durationMs) {
      return interaction.reply({ content: '❌ Invalid duration format.', ephemeral: true });
    }

    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_mute_${target.id}`)
        .setLabel('✅ Confirm Mute')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_mute')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    interaction.client._muteQueue ??= {};
    interaction.client._muteQueue[target.id] = {
      moderator: interaction.user,
      reason,
      durationMs,
      durationText,
      channelId: interaction.channel.id
    };

    await interaction.reply({
      content: `Mute <@${target.id}> for **${durationText}**?\n**Reason:** ${reason}`,
      components: [confirmRow],
      ephemeral: true
    });
  },

  async handleButton(interaction) {
    const [action, , userId] = interaction.customId.split('_');
    const muteData = interaction.client._muteQueue?.[userId];
    if (!muteData) return interaction.reply({ content: '⚠️ Mute session expired or missing.', ephemeral: true });

    const target = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!target) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

    if (action === 'cancel') {
      delete interaction.client._muteQueue[userId];
      return interaction.reply({ content: '❌ Mute canceled.', ephemeral: true });
    }

    if (action === 'confirm') {
      const mutedRole = interaction.guild.roles.cache.get(process.env.MUTED_ROLE_ID);
      if (!mutedRole) {
        return interaction.reply({ content: '❌ Mute role not configured properly.', ephemeral: true });
      }

      let dmSent = false;
      try {
        await target.send(`🔇 You have been muted in **${interaction.guild.name}** for **${muteData.durationText}**.\n**Reason:** ${muteData.reason}`);
        dmSent = true;
      } catch {}

      await target.roles.add(mutedRole, `Muted by ${muteData.moderator.tag} for ${muteData.durationText}`);

      // Schedule unmute
      setTimeout(async () => {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (member && member.roles.cache.has(mutedRole.id)) {
          await member.roles.remove(mutedRole, 'Mute duration expired');
        }
      }, muteData.durationMs);

      // Log to Mongo
      await Log.create({
        type: 'mute',
        data: {
          userId,
          moderatorId: muteData.moderator.id,
          reason: muteData.reason,
          duration: muteData.durationText,
          channelId: muteData.channelId,
          timestamp: new Date(),
          dmSent
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🔇 User Muted')
        .setColor('DarkOrange')
        .addFields(
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${muteData.moderator.id}>`, inline: true },
          { name: 'Duration', value: muteData.durationText, inline: true },
          { name: 'Reason', value: muteData.reason },
          { name: 'Channel', value: `<#${muteData.channelId}>` },
          { name: 'DM Sent?', value: dmSent ? '✅ Yes' : '❌ No' }
        )
        .setTimestamp();

      interaction.client.channels.cache.get(config.logChannelId)?.send({ embeds: [embed] });

      delete interaction.client._muteQueue[userId];

      await interaction.reply({ content: `✅ <@${userId}> has been muted.`, ephemeral: true });
    }
  }
};
