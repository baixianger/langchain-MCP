/**
 * Cloudflare Worker to proxy GitHub API requests
 * This allows IPv6-only servers to access GitHub's IPv4-only API
 */

const ALLOWED_HOSTS = [
  'github.com',
  'api.github.com',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract target URL from path: /proxy/github.com/path -> https://github.com/path
    const match = url.pathname.match(/^\/proxy\/([^\/]+)(\/.*)?$/);
    if (!match) {
      return new Response(JSON.stringify({
        error: 'Invalid path. Use /proxy/{host}/{path}'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const targetHost = match[1];
    const targetPath = match[2] || '/';

    // Security: only allow GitHub hosts
    if (!ALLOWED_HOSTS.includes(targetHost)) {
      return new Response(JSON.stringify({
        error: `Host not allowed: ${targetHost}`
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const targetUrl = `https://${targetHost}${targetPath}${url.search}`;

    // Forward the request
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('Host', targetHost);

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.text()
          : undefined,
      });

      // Return the response with CORS headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: `Proxy error: ${error.message}`
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
