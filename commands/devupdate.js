// commands/devupdate.js
import {
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import config from '../config.js';
import DevUpdate from '../models/DevUpdate.js';

export default {
  data: new SlashCommandBuilder()
    .setName('devupdate')
    .setDescription('Post a developer update for staff.')
    .addStringOption(opt =>
      opt.setName('update')
        .setDescription('Describe the update or fix')
        .setRequired(true)
    ),

  async execute(interaction) {
    const isOwner = interaction.user.id === config.ownerId;
    const hasDevRole = interaction.member.roles.cache.has(config.devRoleId);

    if (!isOwner && !hasDevRole) {
      return interaction.reply({ content: '🚫 Only developers or the bot owner can use this command.', ephemeral: true });
    }

    const updateText = interaction.options.getString('update');

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Dev Update Posted')
      .setDescription(updateText)
      .setColor('Blurple')
      .addFields(
        { name: 'Posted by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setFooter({ text: 'StrikeGuard System • Developer Reports' });

    const channel = interaction.client.channels.cache.get(config.devUpdatesChannelId);
    if (channel) {
      await channel.send({ embeds: [embed] });
    }

    await DevUpdate.create({
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      content: updateText
    });

    await interaction.reply({ content: '✅ Update posted successfully.', ephemeral: true });
  }
};
