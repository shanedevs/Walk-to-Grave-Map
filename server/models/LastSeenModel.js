const mongoose = require('mongoose');

const lastSeenSchema = new mongoose.Schema({
  userId: String,
  latitude: Number,
  longitude: Number,
  updatedAt: Date
});

module.exports = mongoose.model('LastSeen', lastSeenSchema);
