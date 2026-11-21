import dns from 'dns/promises';
import net from 'net';
import type { GroundingSource, ResearchMode } from '../src/core/types.ts';

export interface WebSearchResultItem {
  title: string;
  uri: string;
  snippet: string;
}

export interface WebPageExtract {
  title: string;
  uri: string;
  excerpt: string;
  contentType: string;
}

const REQUEST_TIMEOUT_MS = 6500;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FRIDAY-Desktop-Assistant/1.0';

function isPrivateIpAddress(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    );
  }
  return true;
}

export async function validatePublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL format.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// public URLs are permitted.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0'
  ) {
    throw new Error('Access to local or internal hostnames is blocked for security.');
  }
  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) {
      throw new Error('Access to private IP addresses is blocked for security.');
    }
    return parsed;
  }
  try {
    const looked = await dns.lookup(host, { all: true });
    if (!looked.length || looked.some((entry) => isPrivateIpAddress(entry.address))) {
      throw new Error('Resolved address points to a private network and was blocked.');
    }
  } catch (err) {
    if ((err as Error).message.includes('blocked')) throw err;
    throw new Error(`Unable to resolve host "${host}". Check internet connectivity.`);
  }
  return parsed;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlToReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : 'Web Document';

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|article|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const lines = body
    .split(/\n+/)
    .map((line) => decodeHtmlEntities(line))
    .filter((line) => line.length >= 25);

  return {
    title,
    text: lines.join('\n').slice(0, 12000),
  };
}

export async function fetchPublicWebPage(rawUrl: string): Promise<WebPageExtract> {
  const safeUrl = await validatePublicHttpUrl(rawUrl);
  const res = await fetch(safeUrl.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html, text/plain, application/json;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Website returned HTTP ${res.status} (${res.statusText || 'Error'}).`);
  }

  const contentType = res.headers.get('content-type') || 'text/plain';
  const rawBody = (await res.text()).slice(0, 300_000);

  if (contentType.includes('application/json')) {
    return {
      title: safeUrl.hostname,
      uri: res.url || safeUrl.toString(),
      excerpt: rawBody.slice(0, 6000),
      contentType,
    };
  }

  if (contentType.includes('text/html')) {
    const parsed = stripHtmlToReadableText(rawBody);
    return {
      title: parsed.title || safeUrl.hostname,
      uri: res.url || safeUrl.toString(),
      excerpt: parsed.text || 'Page loaded, but little readable text was detected.',
      contentType,
    };
  }

  return {
    title: safeUrl.hostname,
    uri: res.url || safeUrl.toString(),
    excerpt: rawBody.slice(0, 6000),
    contentType,
  };
}

function decodeDdgRedirectUrl(href: string): string {
  try {
    if (href.startsWith('//')) href = `https:${href}`;
    if (href.startsWith('/l/?')) {
      const full = new URL(`https://duckduckgo.com${href}`);
      const uddg = full.searchParams.get('uddg');
      if (uddg) return uddg;
    }
    const parsed = new URL(href);
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return uddg;
    return parsed.toString();
  } catch {
    return '';
  }
}

async function searchDuckDuckGoHtml(query: string): Promise<WebSearchResultItem[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const items: WebSearchResultItem[] = [];
  const blockRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null && items.length < 8) {
    const targetUrl = decodeDdgRedirectUrl(match[1]);
    const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ''));
    const snippet = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
    if (targetUrl && /^https?:\/\//i.test(targetUrl) && title) {
      items.push({ title, uri: targetUrl, snippet });
    }
  }
  return items;
}

async function searchWikipediaOpen(query: string): Promise<WebSearchResultItem[]> {
  const cleanQ = query
    .replace(/^(what is|who is|tell me about|search( for)?|latest information about|news about)\s+/i, '')
    .trim();
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
    cleanQ || query
  )}&limit=4&namespace=0&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as [string, string[], string[], string[]];
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  const descs = Array.isArray(data?.[2]) ? data[2] : [];
  const urls = Array.isArray(data?.[3]) ? data[3] : [];
  const results: WebSearchResultItem[] = [];
  for (let i = 0; i < titles.length; i += 1) {
    if (urls[i]) {
      results.push({
        title: `${titles[i]} — Wikipedia`,
        uri: urls[i],
        snippet: descs[i] || `Reference article for ${titles[i]}.`,
      });
    }
  }
  return results;
}

export async function searchFreeWeb(
  query: string,
  mode: ResearchMode = 'web'
): Promise<{
  results: WebSearchResultItem[];
  sources: GroundingSource[];
  online: boolean;
  error?: string;
}> {
  const modeSuffix =
    mode === 'news'
      ? ' latest news'
      : mode === 'docs'
        ? ' official documentation'
        : mode === 'video'
          ? ' youtube tutorial'
          : '';
  const effectiveQuery = `${query.trim()}${modeSuffix}`.trim();

  try {
    const [ddgResults, wikiResults] = await Promise.all([
      searchDuckDuckGoHtml(effectiveQuery).catch(() => []),
      mode === 'video' ? Promise.resolve([]) : searchWikipediaOpen(query).catch(() => []),
    ]);

    const seen = new Set<string>();
    const combined: WebSearchResultItem[] = [];
    for (const item of [...ddgResults, ...wikiResults]) {
      if (!seen.has(item.uri)) {
        seen.add(item.uri);
        combined.push(item);
      }
    }

    return {
      results: combined.slice(0, 8),
      sources: combined.slice(0, 6).map((r) => ({ title: r.title, uri: r.uri })),
      online: true,
    };
  } catch (err) {
    return {
      results: [],
      sources: [],
      online: false,
      error: (err as Error).message,
    };
  }
}

export function buildExtractiveSummary(text: string, focusQuery?: string, maxLines = 6): string {
  const rawLines = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30);

  if (rawLines.length === 0) return text.slice(0, 600);

  const keywords = (focusQuery || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) {
    return rawLines.slice(0, maxLines).join(' ');
  }

  const scored = rawLines.map((line, index) => {
    const lower = line.toLowerCase();
    let score = index < 3 ? 2 : 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 3;
    }
    return { line, index, score };
  });

  const top = scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxLines)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.line);

  return top.join(' ');
}
