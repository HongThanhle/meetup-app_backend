const express = require('express');
const verifyToken = require('../middleware/authMiddleware');
const {
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriendship,
  inviteFriendToGroup,
  respondToRoomInvite,
} = require('../controllers/friendController');

const router = express.Router();

router.use(verifyToken);
router.get('/', listFriends);
router.post('/requests', sendFriendRequest);
router.post('/requests/:friendshipId/accept', acceptFriendRequest);
router.delete('/requests/:friendshipId', removeFriendship);
router.post('/room-invites', inviteFriendToGroup);
router.post('/room-invites/:inviteId/respond', respondToRoomInvite);

module.exports = router;
