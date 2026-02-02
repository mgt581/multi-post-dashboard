// ============================================================================
// CENTRALIZED API CONFIGURATION
// ============================================================================
// This file centralizes all API endpoint configuration to prevent hardcoded URLs
// and ensure OAuth redirect URIs work correctly across different deployments.
//
// WHY THIS IS IMPORTANT:
// - Prevents redirect_uri_mismatch errors in OAuth flows
// - Makes the application portable across environments (dev, staging, production)
// - Eliminates the need to update URLs in multiple HTML files
//
// USAGE IN HTML FILES:
// Add this script tag before your main script:
//   <script src="config.js"></script>
// Then use API_BASE constant:
//   const apiBase = API_BASE;
//
// See OAUTH_IMPLEMENTATION_SUMMARY.md for complete details.
// ============================================================================

/**
 * Get the API base URL
 * 
 * Detection Priority:
 * 1. API_BASE_URL global variable (if injected during build process)
 *    Note: The injected variable is API_BASE_URL, but we export as API_BASE
 *    This allows build systems to inject the URL while keeping a clean export name
 * 2. Auto-detect from current location (for same-domain deployments)
 * 3. Default worker URL (for production)
 * 
 * @returns {string} The API base URL (e.g., "https://worker.workers.dev/api")
 */
function getApiBaseUrl() {
  // Check if API_BASE_URL is defined (could be injected during build)
  // Note: This is the injected variable name; we export as API_BASE below
  if (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) {
    return API_BASE_URL;
  }
  
  // Auto-detect: If running on workers.dev domain, use current domain
  // This handles both production and preview deployments
  const currentHost = window.location.hostname;
  if (currentHost.includes('workers.dev')) {
    return `${window.location.protocol}//${currentHost}/api`;
  }
  
  // For custom domains or GitHub Pages, use the default worker URL
  // This should be updated during deployment or via environment variable
  // Default: Use the production worker URL
  return 'https://multipost-seo-worker.alexbryant.workers.dev/api';
}

// Export the API base URL for use in all pages
const API_BASE = getApiBaseUrl();

// Log the configuration for debugging (can be removed in production if needed)
console.log('API Configuration:', {
  baseUrl: API_BASE,
  hostname: window.location.hostname,
  protocol: window.location.protocol
});
