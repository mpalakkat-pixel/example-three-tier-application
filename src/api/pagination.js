/**
 * Pagination utility for list endpoints
 * Provides offset/limit pagination with validation
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
 * Format paginated response
 * @param {Array} items - Array of items to return
 * @param {number} total - Total count of items in database
 * @param {number} offset - Current offset
 * @param {number} limit - Current limit
 * @returns {Object} - Formatted response with items and pagination metadata
 */
function formatPaginatedResponse(items, total, offset, limit) {
  return {
    items,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total
    }
  };
}

module.exports = {
  parsePaginationParams,
  formatPaginatedResponse,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
