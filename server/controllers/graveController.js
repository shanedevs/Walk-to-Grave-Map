// controllers/graveController.js
const { AdultGrave } = require('../models/Grave'); // Use AdultGrave explicitly

const searchGraves = async (req, res) => {
  try {
    const { block } = req.query;
    console.log("🔍 Searching for:", { block });

    const query = {};
    if (block) query.block = { $regex: block, $options: 'i' };

    const graves = await AdultGrave.find(query);

    console.log("✅ Results found:", graves.length);
    res.status(200).json(graves);
  } catch (error) {
    console.error("❌ Error occurred:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { searchGraves };
