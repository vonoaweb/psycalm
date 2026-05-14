/**
 * WhatsApp Webhook — Disabled for now
 * Will be enabled when WhatsApp Cloud API is configured
 */
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.send('WhatsApp webhook - disabled'));
router.post('/', (req, res) => res.json({ status: 'disabled' }));

module.exports = router;
