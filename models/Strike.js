import mongoose from 'mongoose';

const strikeSchema = new mongoose.Schema({
  userId: String,
  reason: String,
  timestamp: { type: Date, default: Date.now },
  approved: { type: Boolean, default: false }
});

export default mongoose.model('Strike', strikeSchema);
