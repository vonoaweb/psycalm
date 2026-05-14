const axios = require('axios');

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const CALCOM_BASE_URL = 'https://api.cal.com/v2';

const calcomClient = axios.create({
  baseURL: CALCOM_BASE_URL,
  headers: {
    'Authorization': `Bearer ${CALCOM_API_KEY}`,
    'Content-Type': 'application/json',
    'cal-api-version': '2024-08-13'
  }
});

module.exports = { calcomClient };
