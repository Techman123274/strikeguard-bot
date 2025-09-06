import {
  SlashCommandBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ActionRowBuilder, EmbedBuilder
} from 'discord.js';
import Log from '../models/Log.js';
import config from '../config.js';

export default {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Add a staff-only note to a user.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('The user to attach a note to')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
      return interaction.reply({ content: '🚫 You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');

    const modal = new ModalBuilder()
      .setCustomId(`note_modal_${target.id}`)
      .setTitle(`Add Note to ${target.tag}`);

    const noteInput = new TextInputBuilder()
      .setCustomId('note')
      .setLabel('Staff Note')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
    await interaction.showModal(modal);
  },

  async handleModalSubmit(interaction) {
    const targetId = interaction.customId.split('_').pop();
    const note = interaction.fields.getTextInputValue('note');
    const target = await interaction.client.users.fetch(targetId);

    // Store in MongoDB
    await Log.create({
      type: 'note',
      data: {
        userId: target.id,
        userTag: target.tag,
        moderatorId: interaction.user.id,
        moderatorTag: interaction.user.tag,
        note,
        timestamp: new Date(),
        channelId: interaction.channel.id
      }
    });

    // Send log embed
    const embed = new EmbedBuilder()
      .setTitle('📝 Staff Note Added')
      .setColor('Blurple')
      .addFields(
        { name: 'User', value: `<@${target.id}> (${target.tag})` },
        { name: 'Moderator', value: `<@${interaction.user.id}> (${interaction.user.tag})` },
        { name: 'Note', value: note },
        { name: 'Channel', value: `<#${interaction.channel.id}>` }
      )
      .setTimestamp();

    interaction.client.channels.cache.get(config.logChannelId)?.send({ embeds: [embed] });

    await interaction.reply({ content: `✅ Note added to <@${target.id}>.`, ephemeral: true });
  }
};
