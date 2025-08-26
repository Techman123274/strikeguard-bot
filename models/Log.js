import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  type: String,
  data: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('Log', logSchema);
