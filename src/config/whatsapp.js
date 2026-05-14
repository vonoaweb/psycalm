const axios = require('axios');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const waClient = axios.create({
  baseURL: `${BASE_URL}/${PHONE_NUMBER_ID}`,
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

module.exports = { waClient, PHONE_NUMBER_ID, API_VERSION, BASE_URL };
