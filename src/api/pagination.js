/**
 * Pagination utility for API endpoints
 * Supports offset/limit pagination with defaults and maximums
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and validate pagination parameters from query string
 * @param {Object} query - Express query object
 * @returns {Object} - { offset, limit } with validated values
 */
function parsePaginationParams(query) {
  let offset = 0;
  let limit = DEFAULT_LIMIT;

  if (query.offset !== undefined) {
    const parsedOffset = parseInt(query.offset, 10);
    if (!Number.isNaN(parsedOffset) && parsedOffset >= 0) {
      offset = parsedOffset;
    }
  }

  if (query.limit !== undefined) {
    const parsedLimit = parseInt(query.limit, 10);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, MAX_LIMIT);
    }
  }

  return { offset, limit };
}

/**
 * Build a paginated SQL query
 * @param {string} baseQuery - Base SQL query (without LIMIT/OFFSET)
 * @param {number} offset - Number of records to skip
 * @param {number} limit - Number of records to return
 * @returns {string} - Complete SQL query with pagination
 */
function buildPaginatedQuery(baseQuery, offset, limit) {
  return `${baseQuery} LIMIT $1 OFFSET $2`;
}

/**
 * Get pagination parameters for a database query
 * @param {number} offset - Offset value
 * @param {number} limit - Limit value
 * @returns {Array} - [limit, offset] for use in parameterized queries
 */
function getPaginationParams(offset, limit) {
  return [limit, offset];
}

/**
 * Build pagination metadata for response
 * @param {number} offset - Current offset
 * @param {number} limit - Current limit
 * @param {number} total - Total number of records
 * @returns {Object} - Pagination metadata
 */
function buildPaginationMeta(offset, limit, total) {
  return {
    offset,
    limit,
    total,
    hasMore: offset + limit < total
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePaginationParams,
  buildPaginatedQuery,
  getPaginationParams,
  buildPaginationMeta
};
