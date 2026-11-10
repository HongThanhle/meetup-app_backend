const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const requireGroupMember = require('../middleware/groupMiddleware');
const {
  createGroup,
  joinGroup,
  getGroupStatus,
  updatePlaceCategories,
  getMyGroups,
  leaveGroup,
} = require('../controllers/groupController');
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
const { listMyMeetupHistory } = require('../controllers/historyController');
const { joinGroupRateLimit, createGroupRateLimit, expensiveRequestRateLimit } = require('../middleware/rateLimits');

router.use(verifyToken);

router.get('/', getMyGroups);
router.get('/history', listMyMeetupHistory);
router.post('/', createGroupRateLimit, createGroup);
router.post('/join', joinGroupRateLimit, joinGroup);
router.get('/:groupId/status', requireGroupMember, getGroupStatus);
router.put('/:groupId/place-categories', requireGroupMember, updatePlaceCategories);
router.post('/:groupId/leave', requireGroupMember, leaveGroup);
router.post('/:groupId/location', requireGroupMember, submitLocation);
router.get('/:groupId/suggest', requireGroupMember, expensiveRequestRateLimit, getSuggestions);
router.post('/:groupId/route', requireGroupMember, expensiveRequestRateLimit, getRouteToSuggestion);

// --- Vote ---
router.post('/:groupId/vote', requireGroupMember, castVote);
router.get('/:groupId/vote-results', requireGroupMember, getVoteResults);
router.post('/:groupId/finalize', requireGroupMember, finalizeManually);

module.exports = router;
