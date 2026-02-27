/**
 * Cloudflare TURN Server Management
 *
 * Handles Cloudflare TURN credentials, ICE server configuration,
 * and caching for WebRTC NAT traversal.
 */

// Fallback STUN servers (used when no custom config)
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Storage keys for Cloudflare TURN credentials
const CF_TURN_CREDENTIALS_KEY = 'nbp-cf-turn-credentials'
const CF_ICE_CACHE_KEY = 'nbp-cf-ice-cache'
const CF_TURN_ENABLED_KEY = 'nbp-cf-turn-enabled'

// Cloudflare TURN API TTL (24 hours in seconds)
const CLOUDFLARE_TURN_TTL = 86400

/**
 * Check if TURN usage is enabled
 * @returns {boolean}
 */
export function isTurnEnabled() {
  const stored = localStorage.getItem(CF_TURN_ENABLED_KEY)
  // Default to true if not set and credentials exist
  if (stored === null) return true
  return stored === 'true'
}

/**
 * Set TURN usage enabled/disabled
 * @param {boolean} enabled
 */
export function setTurnEnabled(enabled) {
  localStorage.setItem(CF_TURN_ENABLED_KEY, String(enabled))
}

/**
 * Get stored Cloudflare TURN credentials from localStorage
 * @returns {{ turnTokenId: string, apiToken: string } | null}
 */
export function getCfTurnCredentials() {
  try {
    const stored = localStorage.getItem(CF_TURN_CREDENTIALS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to read Cloudflare TURN credentials:', e)
  }
  return null
}

/**
 * Save Cloudflare TURN credentials to localStorage
 * @param {string} turnTokenId - Cloudflare TURN Token ID
 * @param {string} apiToken - Cloudflare API Token
 * @returns {{ success: boolean, error?: string }}
 */
export function saveCfTurnCredentials(turnTokenId, apiToken) {
  try {
    if (!turnTokenId?.trim() || !apiToken?.trim()) {
      localStorage.removeItem(CF_TURN_CREDENTIALS_KEY)
      localStorage.removeItem(CF_ICE_CACHE_KEY)
      return { success: true }
    }
    localStorage.setItem(CF_TURN_CREDENTIALS_KEY, JSON.stringify({
      turnTokenId: turnTokenId.trim(),
      apiToken: apiToken.trim(),
    }))
    // Clear cached ICE servers when credentials change
    localStorage.removeItem(CF_ICE_CACHE_KEY)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Check if Cloudflare TURN credentials are configured
 * @returns {boolean}
 */
export function hasCfTurnCredentials() {
  const creds = getCfTurnCredentials()
  return !!(creds?.turnTokenId && creds?.apiToken)
}

/**
 * Clear Cloudflare TURN credentials
 */
export function clearCfTurnCredentials() {
  localStorage.removeItem(CF_TURN_CREDENTIALS_KEY)
  localStorage.removeItem(CF_ICE_CACHE_KEY)
}

/**
 * Fetch ICE servers from Cloudflare TURN API
 * @param {{ turnTokenId?: string, apiToken?: string }} [credentials] - Optional credentials to use instead of stored ones
 * @returns {Promise<{ success: boolean, iceServers?: Array, error?: string }>}
 */
export async function fetchCfIceServers(credentials = null) {
  // Use provided credentials or fall back to stored ones
  const creds = credentials || getCfTurnCredentials()
  if (!creds?.turnTokenId || !creds?.apiToken) {
    return { success: false, error: 'Cloudflare TURN credentials not configured' }
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${creds.turnTokenId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: CLOUDFLARE_TURN_TTL }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Cloudflare API error: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    const iceServers = data.iceServers || data

    if (!Array.isArray(iceServers)) {
      return { success: false, error: 'Invalid response format from Cloudflare' }
    }

    // Only cache if using stored credentials (not during validation)
    if (!credentials) {
      const cacheExpiry = Date.now() + (CLOUDFLARE_TURN_TTL * 0.9 * 1000)
      localStorage.setItem(CF_ICE_CACHE_KEY, JSON.stringify({
        iceServers,
        expiry: cacheExpiry,
      }))
    }

    return { success: true, iceServers }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Get cached ICE servers if still valid
 * @returns {Array|null}
 */
function getCachedIceServers() {
  try {
    const cached = localStorage.getItem(CF_ICE_CACHE_KEY)
    if (cached) {
      const { iceServers, expiry } = JSON.parse(cached)
      if (Date.now() < expiry) {
        return iceServers
      }
      // Cache expired, remove it
      localStorage.removeItem(CF_ICE_CACHE_KEY)
    }
  } catch (e) {
    console.error('Failed to read ICE cache:', e)
  }
  return null
}

/**
 * Build ICE servers list - uses cache or fetches fresh if needed
 * @returns {Promise<Array>}
 */
export async function buildIceServers() {
  // Check if Cloudflare credentials are configured and TURN is enabled
  if (!hasCfTurnCredentials() || !isTurnEnabled()) {
    return FALLBACK_ICE_SERVERS
  }

  // Check cache first
  const cached = getCachedIceServers()
  if (cached) {
    return cached
  }

  // Fetch fresh ICE servers
  const result = await fetchCfIceServers()
  if (result.success && result.iceServers) {
    return result.iceServers
  }

  // Fallback if fetch fails
  console.warn('Failed to fetch Cloudflare ICE servers, using fallback:', result.error)
  return FALLBACK_ICE_SERVERS
}

/**
 * Composable wrapper for Vue components
 */
export function useCloudflareTurn() {
  return {
    isTurnEnabled,
    setTurnEnabled,
    getCfTurnCredentials,
    saveCfTurnCredentials,
    hasCfTurnCredentials,
    clearCfTurnCredentials,
    fetchCfIceServers,
    buildIceServers,
  }
}
