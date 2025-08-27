// models/Sound.js
"use strict";
import mongoose from "mongoose";

const SoundSchema = new mongoose.Schema({
  guildId: { type: String, index: true, required: true },
  name: { type: String, required: true },
  url:  { type: String, required: true },
  addedBy: { type: String },
  createdAt: { type: Date, default: Date.now }
});

SoundSchema.index({ guildId: 1, name: 1 }, { unique: true });

export default mongoose.model("Sound", SoundSchema);
