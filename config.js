// config.js (ESM)
import 'dotenv/config';

export default {
  ownerId: process.env.OWNER_ID,
  logChannelId: process.env.LOG_CHANNEL_ID,
  disciplineChannelId: process.env.DISCIPLINE_CHANNEL_ID,
  adminRoleId: process.env.ADMIN_ROLE_ID,
  devUpdatesChannelId: process.env.DEV_UPDATES_CHANNEL_ID, // move to env too
  devRoleId: process.env.DEV_ROLE_ID,               // who can lock/unlock

};

