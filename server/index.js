require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB setup using Mongoose
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://happytooou:cFI51B3bXpjMWem9@walktograve.tfqc8vj.mongodb.net/walktograve?retryWrites=true&w=majority';

// Connect to MongoDB with Mongoose
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log("✅ Connected to MongoDB successfully!");

  // Routes
  app.get('/', (req, res) => {
    res.send('Server is running...');
  });

  // LastSeen Route (if it exists)
  const LastSeen = require('./routes/LastSeenRoute');
  app.use('/api/last-seen', LastSeen);
  console.log('🔄 LastSeenRoute connected to collection.');

  // Graves Route
  const graveRoutes = require('./routes/graves');
  app.use('/api/graves', graveRoutes);
  console.log('🔄 graves connected to collection.');

  // Start the server
  app.listen(port, () => {
    console.log(`🚀 Server is listening at http://localhost:${port}`);
  });

})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
});
