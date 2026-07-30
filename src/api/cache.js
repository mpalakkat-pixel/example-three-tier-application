const NodeCache = require('node-cache');

// Create a cache instance with a standard TTL of 60 seconds
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

module.exports = cache;
