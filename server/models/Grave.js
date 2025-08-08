// models/Grave.js
const mongoose = require('mongoose');

const graveSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  nickname: String,
  dateOfBirth: Date,
  month: String,
  day: String,
  burial: String,
  exhumed: String,
  expiry: String,
  phase: String,
  aptNo: String,
  remarks: String,
  image: String,
  description: String,
  CandleCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = {
  AdultGrave: mongoose.model('AdultGrave', graveSchema, 'adultgraves'),
  ChildGrave: mongoose.model('ChildGrave', graveSchema, 'childgraves'),
  BoneGrave: mongoose.model('BoneGrave', graveSchema, 'bonegraves'),
};
