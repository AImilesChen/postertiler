import { handleAuth } from './auth.mjs';
import { handleBilling } from './billing/handler.mjs';

export default {
  async fetch(request, env) {
    try {
      const response = await handleBilling(request, env) || await handleAuth(request, env);
      if (response) return response;
      const asset = await env.ASSETS.fetch(request);
      if (!new URL(request.url).pathname.startsWith('/account')) return asset;
      const headers = new Headers(asset.headers);
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      headers.set('Referrer-Policy', 'no-referrer');
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'temporarily_unavailable' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
      });
    }
  },
};
