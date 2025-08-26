export default client => {
  client.on('interactionCreate', async interaction => {
    try {
      // Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
      }

      // Modal Submissions
      else if (interaction.isModalSubmit()) {
        const modalId = interaction.customId.split('_')[0]; // e.g., warn_reason_modal_USERID
        const command = client.commands.get(modalId);
        if (command?.handleModalSubmit) {
          await command.handleModalSubmit(interaction, client);
        }
      }

      // Button Interactions
      else if (interaction.isButton()) {
        const [prefix, action, userId] = interaction.customId.split('_');

        // 🔘 MOD PANEL BUTTONS
        if (prefix === 'mod') {
          const command = client.commands.get(action);
          if (!command || !command.execute) {
            return interaction.reply({ content: '❌ This moderation action is not yet available.', ephemeral: true });
          }

          // Fetch user and inject into simulated interaction.options
          const fetchedUser = await interaction.client.users.fetch(userId);
          interaction.options = {
            getUser: () => fetchedUser
          };

          await command.execute(interaction, client);
        }

        // 🧱 COMMAND-SPECIFIC BUTTONS (e.g., confirm_kick_123)
        else {
          const command = client.commands.get(action);
          if (command?.handleButton) {
            await command.handleButton(interaction, client);
          }
        }
      }

    } catch (err) {
      console.error('❌ Interaction error:', err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'An error occurred.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
      }
    }
  });
};
