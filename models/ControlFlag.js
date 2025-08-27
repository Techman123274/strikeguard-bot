// models/ControlFlag.js
import mongoose from "mongoose";

const ControlFlagSchema = new mongoose.Schema({
  key:   { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedBy: {
    id:  { type: String },
    tag: { type: String },
  },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.ControlFlag
  || mongoose.model("ControlFlag", ControlFlagSchema);
