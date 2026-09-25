const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { createGroup, joinGroup, getGroupStatus, getMyGroups, leaveGroup } = require('../controllers/groupController');
const { submitLocation, getSuggestions } = require('../controllers/locationController');

router.use(verifyToken);

router.get('/', getMyGroups);
router.post('/', createGroup);
router.post('/join', joinGroup);
router.get('/:groupId/status', getGroupStatus);
router.post('/:groupId/leave', leaveGroup);
router.post('/:groupId/location', submitLocation);
router.get('/:groupId/suggest', getSuggestions);

module.exports = router;