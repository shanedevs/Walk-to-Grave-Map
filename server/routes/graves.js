const express = require('express');
const router = express.Router();
const { getAllGraves, searchGraves } = require('../controllers/graveController');

router.get('/search', searchGraves);      // ✅ GET /api/graves/search?firstName=marites&lastName=galang
// Add this route below your /search route
router.get('/:blockId', (req, res) => {
  const blockId = req.params.blockId;
  
  // Sample logic — palitan mo ito ng actual DB query if needed
  res.json({ message: `You requested block: ${blockId}` });
});

module.exports = router;
