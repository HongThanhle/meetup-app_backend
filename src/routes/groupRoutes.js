const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const requireGroupMember = require('../middleware/groupMiddleware');
const { createGroup, joinGroup, getGroupStatus, getMyGroups, leaveGroup } = require('../controllers/groupController');
const {
  submitLocation,
  getSuggestions,
  getRouteToSuggestion,
} = require('../controllers/locationController');
const {
  castVote,
  getVoteResults,
  finalizeManually,
} = require('../controllers/voteController');

router.use(verifyToken);

router.get('/', getMyGroups);
router.post('/', createGroup);
router.post('/join', joinGroup);
router.get('/:groupId/status', requireGroupMember, getGroupStatus);
router.post('/:groupId/leave', requireGroupMember, leaveGroup);
router.post('/:groupId/location', requireGroupMember, submitLocation);
router.get('/:groupId/suggest', requireGroupMember, getSuggestions);
router.post('/:groupId/route', requireGroupMember, getRouteToSuggestion);

// --- Vote ---
router.post('/:groupId/vote', requireGroupMember, castVote);
router.get('/:groupId/vote-results', requireGroupMember, getVoteResults);
router.post('/:groupId/finalize', requireGroupMember, finalizeManually);

module.exports = router;