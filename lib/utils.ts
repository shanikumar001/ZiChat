/** API base URL: full backend URL + /api */
export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base && typeof base === 'string' && base.trim() !== '') {
    const clean = base.replace(/\/$/, '');
    if (clean === '/api' || clean.endsWith('/api')) {
      return clean;
    }
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return `${clean}/api`;
    }
    return clean;
  }
  return '/api';
}

/** Resilient fetch function that falls back to Next.js internal /api if external backend connection fails */
export async function fetchApi(endpoint: string, options?: RequestInit): Promise<Response> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const apiBase = getApiBase();
  const primaryUrl = apiBase.endsWith('/api')
    ? `${apiBase}${cleanEndpoint}`
    : `${apiBase}/api${cleanEndpoint}`;
  const fallbackUrl = `/api${cleanEndpoint}`;

  try {
    const res = await fetch(primaryUrl, options);
    return res;
  } catch (err) {
    // If primary fetch fails, try fallback internal route handler
    if (primaryUrl !== fallbackUrl) {
      try {
        const fallbackRes = await fetch(fallbackUrl, options);
        return fallbackRes;
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

/** Origin for media paths */
export function getMediaOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (base && typeof base === 'string') {
    return base.replace(/\/$/, '');
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** Build full URL for media paths like /api/media/avatars/xxx or Cloudinary objects */
export function getMediaUrl(path: unknown): string | null {
  if (!path) return null;

  // Cloudinary object: { url, filename }
  if (typeof path === 'object' && path !== null && 'url' in path) {
    return (path as { url: string }).url || null;
  }

  if (typeof path !== 'string') return null;

  // Already a full URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Local / relative path
  const origin = getMediaOrigin();
  return origin
    ? `${origin}${path.startsWith('/') ? path : '/' + path}`
    : path;
}

