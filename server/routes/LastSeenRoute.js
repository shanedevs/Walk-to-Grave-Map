const express = require('express');
const router = express.Router();
const { MongoClient, ServerApiVersion } = require('mongodb');

// Create a new client and use the same URI from your main server
const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let collection;

// Connect to database once
client.connect().then(() => {
  const db = client.db("wtgwebsite");
  collection = db.collection("lastseen");
  console.log("🔄 LastSeenRoute connected to collection.");
}).catch(err => {
  console.error("❌ Error connecting LastSeenRoute:", err);
});

// POST: Save/update last seen location
router.post('/', async (req, res) => {
  const { userId, latitude, longitude } = req.body;

  if (!userId || latitude == null || longitude == null) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const updatedAt = new Date();
    const result = await collection.updateOne(
      { userId },
      { $set: { latitude, longitude, updatedAt } },
      { upsert: true }
    );
    res.status(200).json({ message: "Last seen updated.", result });
  } catch (err) {
    console.error("❌ Failed to update last seen:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET: Retrieve all last seen records (optional)
router.get('/', async (req, res) => {
  try {
    const records = await collection.find().toArray();
    res.status(200).json(records);
  } catch (err) {
    console.error("❌ Failed to fetch records:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
