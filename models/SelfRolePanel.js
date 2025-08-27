// models/SelfRolePanel.js
import mongoose from "mongoose";

const SelfRolePanelSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true, unique: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },

  title: { type: String, default: "Sublevel Society — Self Roles" },
  description: { type: String, default: "Choose your roles below." },
  color: { type: String, default: "#5865F2" },
  footer: { type: String, default: "Use the menu to add/remove roles." },

  roles: [
    {
      roleId: { type: String, required: true },
      label: { type: String, required: true },
      emoji: { type: String, default: null }
    }
  ],

  version: { type: Number, default: 1 }
}, { timestamps: true });

const SelfRolePanel = mongoose.model("SelfRolePanel", SelfRolePanelSchema);
export default SelfRolePanel;
