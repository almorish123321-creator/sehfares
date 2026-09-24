/**
 * ShortIoService - Production integration for Short.io URL Shortening
 * Used for Educational Sick Leaves (سكاليف للإجازات المرضية التعليمية)
 *
 * Domain: sehaedu.s.gy
 * Official API Endpoint: POST https://api.short.io/links
 */

const API_BASE_URL = 'https://api.short.io';
const DEFAULT_DOMAIN = 'sehaedu.s.gy';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

class ShortIoService {
    constructor() {
        // In-memory cache to prevent duplicate API requests for the same record
        this.cache = new Map();
    }

    /**
     * Get configured domain from environment or fallback to default
     */
    getDomain() {
        return (process.env.SHORTIO_DOMAIN || DEFAULT_DOMAIN).trim().toLowerCase();
    }

    /**
     * Get API key securely from environment variables
     * NEVER hardcoded or exposed to client
     */
    getApiKey() {
        return (
            process.env.SHORTIO_API_KEY ||
            process.env.SHORT_IO_API_KEY ||
            process.env.SHORTIO_KEY ||
            process.env.SHORT_IO_KEY ||
            process.env.SHORTIO_SECRET ||
            process.env.SHORT_IO_SECRET ||
            process.env.SHORTIO_TOKEN ||
            process.env.SHORT_IO_TOKEN ||
            process.env.shortio_api_key ||
            process.env.short_io_api_key ||
            ''
        ).trim();
    }

    /**
     * Check if Short.io API key is configured
     */
    isConfigured() {
        const key = this.getApiKey();
        return Boolean(key && key.length > 0 && !key.includes('<'));
    }

    /**
     * Sanitize slug / path to ensure:
     * 1. Only safe alphanumeric, dash, and underscore characters are kept.
     * 2. NO personal data, health data, or national IDs are leaked into the path.
     * 3. Length is constrained.
     */
    sanitizePath(rawPath) {
        if (!rawPath) return '';
        // Convert digits, remove non-alphanumeric/dash/underscore
        const cleanDigits = String(rawPath)
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

        const sanitized = cleanDigits
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '')
            .substring(0, 32);

        return sanitized;
    }

    /**
     * Construct canonical fallback short URL
     */
    buildFallbackUrl(path) {
        const sanitized = this.sanitizePath(path);

        // IMPORTANT: a `<short-domain>/<slug>` URL is only valid if the link was
        // actually created through the Short.io API. When no API key is configured
        // that link does NOT exist and returns 404 — so the QR code on the PDF
        // would lead nowhere.
        // In that case point at this app's own slug route (see server.js), which
        // redirects to the inquiry page. The link keeps working either way.
        const appBase = (
            process.env.FALLBACK_SHORT_BASE ||
            process.env.WEB_APP_URL ||
            process.env.RENDER_EXTERNAL_URL ||
            ''
        ).trim().replace(/\/+$/, '');

        if (appBase) {
            return `${appBase}/${sanitized}`;
        }

        const domain = this.getDomain();
        return `https://${domain}/${sanitized}`;
    }

    /**
     * Create or retrieve a short link using official Short.io API
     * 
     * @param {Object} params
     * @param {string} params.originalURL - Target URL in our inquiry system
     * @param {string} params.path - Unique service code / leaveId (e.g. 'B82LM4')
     * @param {boolean} [params.allowDuplicates=false] - Prevent duplicate creation
     * @returns {Promise<{success: boolean, shortURL: string, idString?: string, fromCache?: boolean}>}
     */
    // =================================================================
    // Dub.co support
    //
    // Dub is used as the primary provider when DUB_API_KEY is present.
    // Its API differs from Short.io: POST https://api.dub.co/links with
    // a Bearer token and { url, domain, key } body; an existing key
    // returns 409 and can be fetched from GET /links/info.
    // =================================================================
    getDubKey() {
        return (process.env.DUB_API_KEY || '').trim();
    }

    getDubDomain() {
        return (process.env.DUB_DOMAIN || 'farescccc.com').trim().toLowerCase();
    }

    isDubConfigured() {
        const key = this.getDubKey();
        return Boolean(key && key.startsWith('dub_'));
    }

    /**
     * Verify that a short domain actually resolves on the public internet.
     * A domain that is registered but has no DNS record produces links that
     * 404 for the end user — exactly the failure mode we must avoid. Result is
     * cached so this costs at most one lookup per TTL.
     */
    async isDomainReachable(domain, ttlMs = 10 * 60 * 1000) {
        const key = `dns:${domain}`;
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.at < ttlMs) return cached.ok;

        let ok = false;
        try {
            const dns = require('dns').promises;
            const records = await Promise.race([
                Promise.allSettled([dns.resolve4(domain), dns.resolveCname(domain)]),
                new Promise((_, rej) => setTimeout(() => rej(new Error('dns timeout')), 5000))
            ]);
            ok = records.some((r) => r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 0);
        } catch (e) {
            ok = false;
        }
        this.cache.set(key, { at: Date.now(), ok });
        if (!ok) {
            console.warn(`[ShortLinks] Domain "${domain}" has no DNS record — its links would not open. Using the app URL instead.`);
        }
        return ok;
    }

    async createDubLink({ originalURL, path }) {
        const key = this.sanitizePath(path);
        const domain = this.getDubDomain();
        const apiKey = this.getDubKey();

        const payload = { url: originalURL, domain, key };

        let lastError = null;
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
            try {
                const response = await fetch('https://api.dub.co/links', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    return {
                        success: true,
                        shortURL: data.shortLink,
                        idString: data.id,
                        domain,
                        path: key,
                        provider: 'dub'
                    };
                }

                // Key already taken -> fetch the existing link
                if (response.status === 409) {
                    const existing = await this.getExistingDubLink(domain, key);
                    if (existing) return existing;
                }

                let errMsg = `Dub responded ${response.status}`;
                try {
                    const body = await response.json();
                    errMsg = (body.error && body.error.message) || body.message || errMsg;
                } catch (e) { /* keep default */ }

                if (response.status >= 500 && attempt <= MAX_RETRIES) {
                    await new Promise((r) => setTimeout(r, 1000 * attempt));
                    continue;
                }
                // 4xx (other than 409) will not succeed on retry
                throw new Error(errMsg);
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                if (attempt <= MAX_RETRIES && !/^(Dub responded 4|Invalid|Unauthorized)/.test(err.message)) {
                    await new Promise((r) => setTimeout(r, 1000 * attempt));
                    continue;
                }
                break;
            }
        }
        throw lastError || new Error('Dub request failed');
    }

    async getExistingDubLink(domain, path) {
        try {
            const url = `https://api.dub.co/links/info?domain=${encodeURIComponent(domain)}&key=${encodeURIComponent(path)}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.getDubKey()}`, 'Accept': 'application/json' }
            });
            if (!response.ok) return null;
            const data = await response.json();
            return {
                success: true,
                shortURL: data.shortLink,
                idString: data.id,
                domain,
                path,
                provider: 'dub',
                alreadyExists: true
            };
        } catch (e) {
            return null;
        }
    }

    async createShortLink({ originalURL, path, allowDuplicates = false }) {
        const domain = this.getDomain();
        const sanitizedPath = this.sanitizePath(path);

        if (!sanitizedPath) {
            throw new Error('ShortIoService: Invalid path/service code provided');
        }

        if (!originalURL) {
            throw new Error('ShortIoService: originalURL is required');
        }

        // 0. Dub.co takes priority when configured AND its domain is reachable.
        //    Skipping an unreachable domain avoids handing the user a dead link.
        if (this.isDubConfigured()) {
            const dubDomain = this.getDubDomain();
            const dubCacheKey = `dub:${dubDomain}:${sanitizedPath}`;
            if (this.cache.has(dubCacheKey)) {
                const c = this.cache.get(dubCacheKey);
                return { ...c, fromCache: true };
            }
            if (await this.isDomainReachable(dubDomain)) {
                try {
                    const dubResult = await this.createDubLink({ originalURL, path: sanitizedPath });
                    this.cache.set(dubCacheKey, dubResult);
                    return dubResult;
                } catch (e) {
                    console.warn('[DubService] Short link creation failed:', e.message);
                }
            }
        }

        // 1. Check in-memory cache to prevent duplicate API calls for this record
        const cacheKey = `${domain}:${sanitizedPath}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            return {
                success: true,
                shortURL: cached.shortURL,
                idString: cached.idString,
                domain: domain,
                path: sanitizedPath,
                fromCache: true
            };
        }

        // 2. Fallback if API key is not yet configured in environment variables
        // Short.io is skipped as well when its domain does not resolve.
        if (this.isConfigured() && !(await this.isDomainReachable(domain))) {
            const fallbackUrl = this.buildFallbackUrl(sanitizedPath);
            const result = {
                success: true,
                shortURL: fallbackUrl,
                domain,
                path: sanitizedPath,
                isFallback: true,
                warning: `Domain ${domain} is not reachable (no DNS record)`
            };
            this.cache.set(cacheKey, result);
            return result;
        }

        if (!this.isConfigured()) {
            const fallbackUrl = this.buildFallbackUrl(sanitizedPath);
            console.warn(`[ShortIoService] SHORTIO_API_KEY is not set. Generated fallback URL: ${fallbackUrl}`);
            const result = {
                success: true,
                shortURL: fallbackUrl,
                domain: domain,
                path: sanitizedPath,
                isFallback: true,
                warning: 'SHORTIO_API_KEY not configured in environment variables'
            };
            this.cache.set(cacheKey, result);
            return result;
        }

        const apiKey = this.getApiKey();
        const payload = {
            domain: domain,
            originalURL: originalURL,
            path: sanitizedPath,
            allowDuplicates: Boolean(allowDuplicates)
        };

        // 3. Request with Retry & Timeout logic
        let lastError = null;
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

            try {
                const response = await fetch(`${API_BASE_URL}/links`, {
                    method: 'POST',
                    headers: {
                        'Authorization': apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                // Success (200 / 201)
                if (response.ok) {
                    const data = await response.json();
                    const shortURL = data.shortURL || data.secureShortURL || this.buildFallbackUrl(sanitizedPath);
                    const result = {
                        success: true,
                        shortURL: shortURL,
                        idString: data.idString || data.id,
                        originalURL: data.originalURL || originalURL,
                        domain: domain,
                        path: sanitizedPath
                    };
                    this.cache.set(cacheKey, result);
                    console.log(`[ShortIoService] Successfully created short link: ${shortURL} -> ${originalURL}`);
                    return result;
                }

                // Handle Duplicate / Conflict (409 or 400 with duplicate message)
                if (response.status === 409 || response.status === 400) {
                    const errData = await response.json().catch(() => ({}));
                    const errMsg = (errData.message || errData.error || '').toLowerCase();

                    if (response.status === 409 || errMsg.includes('already exists') || errMsg.includes('duplicate')) {
                        console.log(`[ShortIoService] Link for path "${sanitizedPath}" already exists on ${domain}. Fetching existing link...`);
                        const existing = await this.getExistingLink(domain, sanitizedPath);
                        if (existing && existing.shortURL) {
                            this.cache.set(cacheKey, existing);
                            return existing;
                        }
                        // If lookup returned null, return canonical short URL
                        const fallbackUrl = this.buildFallbackUrl(sanitizedPath);
                        const fallbackResult = {
                            success: true,
                            shortURL: fallbackUrl,
                            domain: domain,
                            path: sanitizedPath,
                            alreadyExists: true
                        };
                        this.cache.set(cacheKey, fallbackResult);
                        return fallbackResult;
                    }

                    // Other 4xx client errors (e.g. 401 Unauthorized) -> do not retry
                    console.error(`[ShortIoService] Short.io API returned HTTP ${response.status}:`, errData);
                    lastError = new Error(errData.message || `HTTP ${response.status}`);
                    break;
                }

                // 5xx Server Error -> retry
                if (response.status >= 500) {
                    const serverErr = await response.text().catch(() => '');
                    console.warn(`[ShortIoService] Short.io 5xx error (attempt ${attempt}/${MAX_RETRIES + 1}):`, serverErr);
                    lastError = new Error(`Short.io server error: ${response.status}`);
                }

            } catch (err) {
                clearTimeout(timeoutId);
                const isTimeout = err.name === 'AbortError';
                console.warn(`[ShortIoService] Request error (attempt ${attempt}/${MAX_RETRIES + 1}):`, isTimeout ? 'Request timed out' : err.message);
                lastError = isTimeout ? new Error('Short.io request timed out') : err;
            }

            // Exponential backoff before next attempt
            if (attempt <= MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }

        // 4. Graceful Fallback if Short.io API fails
        const fallbackUrl = this.buildFallbackUrl(sanitizedPath);
        console.error(`[ShortIoService] All attempts to Short.io failed: ${lastError ? lastError.message : 'Unknown error'}. Using fallback URL: ${fallbackUrl}`);
        const fallbackResult = {
            success: true,
            shortURL: fallbackUrl,
            domain: domain,
            path: sanitizedPath,
            isFallback: true,
            error: lastError ? lastError.message : 'Short.io API unreachable'
        };
        this.cache.set(cacheKey, fallbackResult);
        return fallbackResult;
    }

    /**
     * Retrieve an existing link by domain and path
     * GET https://api.short.io/links/expand?domain=...&path=...
     */
    async getExistingLink(domain, path) {
        if (!this.isConfigured()) return null;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            const url = `${API_BASE_URL}/links/expand?domain=${encodeURIComponent(domain)}&path=${encodeURIComponent(path)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.getApiKey(),
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    shortURL: data.shortURL || data.secureShortURL || this.buildFallbackUrl(path),
                    idString: data.idString || data.id,
                    originalURL: data.originalURL,
                    domain: domain,
                    path: path,
                    alreadyExists: true
                };
            }
            return null;
        } catch (e) {
            clearTimeout(timeoutId);
            console.warn('[ShortIoService] Error fetching existing link:', e.message);
            return null;
        }
    }

    /**
     * Retrieve all custom domains associated with this Short.io account
     * GET https://api.short.io/api/domains
     */
    async getDomains() {
        if (!this.isConfigured()) return [];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_BASE_URL}/api/domains`, {
                method: 'GET',
                headers: {
                    'Authorization': this.getApiKey(),
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                return Array.isArray(data) ? data : (data.domains || []);
            }
            return [];
        } catch (e) {
            clearTimeout(timeoutId);
            console.warn('[ShortIoService] Error fetching domains:', e.message);
            return [];
        }
    }

    /**
     * Configure default Root & 404 redirects on Short.io domain
     * Ensures visiting the root domain or non-existent/expired links redirects
     * to the inquiry interface instead of showing Short.io 404 page
     */
    async configureDomainRedirects(targetInquiryUrl) {
        if (!this.isConfigured() || !targetInquiryUrl) {
            return { success: false, error: 'ShortIoService not configured or missing target URL' };
        }

        try {
            const domains = await this.getDomains();
            const configuredDomain = this.getDomain();
            const found = domains.find(d => (d.hostname || d.domain || '').toLowerCase() === configuredDomain);
            if (!found || !found.id) {
                return { success: false, error: `Domain ${configuredDomain} not found in Short.io account` };
            }

            const domainId = found.id;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

            // Try both API paths commonly used by Short.io
            let response = await fetch(`${API_BASE_URL}/api/domains/${domainId}`, {
                method: 'POST',
                headers: {
                    'Authorization': this.getApiKey(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    rootRedirect: targetInquiryUrl,
                    notFoundRedirect: targetInquiryUrl
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                response = await fetch(`${API_BASE_URL}/domains/${domainId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': this.getApiKey(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        rootRedirect: targetInquiryUrl,
                        notFoundRedirect: targetInquiryUrl
                    })
                });
            }

            clearTimeout(timeoutId);
            const data = await response.json().catch(() => ({}));
            return { success: response.ok, data };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

// Export singleton instance
const shortIoService = new ShortIoService();
module.exports = shortIoService;
