// models/DevUpdate.js
import mongoose from 'mongoose';

const devUpdateSchema = new mongoose.Schema({
  authorId: String,
  authorTag: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('DevUpdate', devUpdateSchema);
