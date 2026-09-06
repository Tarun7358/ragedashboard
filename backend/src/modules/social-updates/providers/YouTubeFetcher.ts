/**
 * Social Updates Module — YouTubeFetcher
 *
 * Direct interface for communicating with YouTube feeds and HTML pages.
 * Decouples platform-specific network fetching and parsing from base providers.
 */

import { ContentItem } from './BaseProvider.js';

const RSS_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const YT_CHANNEL_PATTERN = /UC[\w-]{21}[AQgw]/;

export class YouTubeFetcher {
  /**
   * Extract channel ID and handles from raw input string.
   */
  static extractChannelInfo(input: string): { type: 'id' | 'handle'; value: string } {
    const trimmed = input.trim();

    if (YT_CHANNEL_PATTERN.test(trimmed)) {
      return { type: 'id', value: trimmed };
    }

    if (trimmed.startsWith('@')) {
      return { type: 'handle', value: trimmed };
    }

    if (trimmed.includes('youtube.com')) {
      const channelMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]{21}[AQgw])/);
      if (channelMatch) return { type: 'id', value: channelMatch[1] };

      const atMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/);
      if (atMatch) return { type: 'handle', value: `@${atMatch[1]}` };

      const legacyMatch = trimmed.match(/youtube\.com\/(?:c|user)\/([\w.-]+)/);
      if (legacyMatch) return { type: 'handle', value: `@${legacyMatch[1]}` };
    }

    return { type: 'handle', value: trimmed.startsWith('@') ? trimmed : `@${trimmed}` };
  }

  /**
   * Resolve handle string to canonical Channel ID, name, and avatar by fetching channel page.
   */
  static async resolveHandle(handle: string): Promise<{ channelId: string | null; name: string | null; avatar: string | null }> {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;
    const pageUrl = `https://www.youtube.com/@${cleanHandle}`;

    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) return { channelId: null, name: null, avatar: null };
      const html = await response.text();

      const idMatch = html.match(/"channelId":"(UC[\w-]{21}[AQgw])"/) ||
                      html.match(/"browseId":"(UC[\w-]{21}[AQgw])"/) ||
                      html.match(/youtube\.com\/channel\/(UC[\w-]{21}[AQgw])/) ||
                      html.match(/<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{21}[AQgw])/);
      
      const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                        html.match(/<meta name="twitter:title" content="([^"]+)"/) ||
                        html.match(/<title>([^<]+)<\/title>/);
      
      const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/) ||
                          html.match(/<meta name="twitter:image" content="([^"]+)"/) ||
                          html.match(/"thumbnails":\[{"url":"(https:\/\/yt3\.ggpht\.com[^"]+)"/);

      let avatarUrl = avatarMatch?.[1] || avatarMatch?.[2] || null;
      if (avatarUrl) {
        avatarUrl = avatarUrl.replace(/&amp;/g, '&');
        if (avatarUrl.includes('=s')) {
          avatarUrl = avatarUrl.replace(/=s\d+[^&]*/, '=s176');
        }
      }

      return {
        channelId: idMatch?.[1] || null,
        name: nameMatch?.[1]?.replace(' - YouTube', '') || cleanHandle,
        avatar: avatarUrl
      };
    } catch {
      return { channelId: null, name: null, avatar: null };
    }
  }

  /**
   * Retrieve name and metadata using direct Channel ID.
   */
  static async fetchChannelInfo(channelId: string): Promise<{ name: string; avatar: string | null; isVerified: boolean }> {
    try {
      const pageUrl = `https://www.youtube.com/channel/${channelId}`;
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) return { name: channelId, avatar: null, isVerified: false };
      const html = await response.text();

      const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                        html.match(/<meta name="twitter:title" content="([^"]+)"/) ||
                        html.match(/<title>([^<]+)<\/title>/);

      const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/) ||
                          html.match(/<meta name="twitter:image" content="([^"]+)"/) ||
                          html.match(/"thumbnails":\[{"url":"(https:\/\/yt3\.ggpht\.com[^"]+)"/);

      let avatarUrl = avatarMatch?.[1] || avatarMatch?.[2] || null;
      if (avatarUrl) {
        avatarUrl = avatarUrl.replace(/&amp;/g, '&');
        if (avatarUrl.includes('=s')) {
          avatarUrl = avatarUrl.replace(/=s\d+[^&]*/, '=s176');
        }
      }

      return {
        name: nameMatch?.[1]?.replace(' - YouTube', '') || channelId,
        avatar: avatarUrl,
        isVerified: html.includes('"isVerified":true')
      };
    } catch {
      return { name: channelId, avatar: null, isVerified: false };
    }
  }

  /**
   * Fetch RSS feed and parse into ContentItem array.
   */
  static async fetchRssFeed(channelId: string, limit = 15): Promise<ContentItem[]> {
    const rssUrl = `${RSS_BASE}${channelId}`;
    const resp = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) throw new Error(`RSS feed returned ${resp.status} for channel ${channelId}`);
    const xml = await resp.text();
    return this.parseAtomXml(xml, channelId).slice(0, limit);
  }

  /**
   * Check if a YouTube video is a YouTube Short by making a lightweight HEAD request.
   */
  static async checkIfShort(videoId: string, fallbackIsShort: boolean = false): Promise<boolean> {
    if (fallbackIsShort) return true;
    if (!videoId) return false;
    try {
      const resp = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3000)
      });
      // A YouTube Short URL returns 200 OK. Standard videos return 303/302 redirecting to /watch?v=...
      return resp.status === 200;
    } catch {
      return fallbackIsShort;
    }
  }

  /**
   * Parse RSS feed XML tags.
   */
  private static parseAtomXml(xml: string, channelId: string): ContentItem[] {
    const items: ContentItem[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let entryMatch: RegExpExecArray | null;

    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entry = entryMatch[1];

      const videoId = this.extractTag(entry, 'yt:videoId') || '';
      const title = this.decodeEntities(this.extractTag(entry, 'title') || '');
      const published = this.extractTag(entry, 'published') || new Date().toISOString();
      const updated = this.extractTag(entry, 'updated') || published;
      const description = this.decodeEntities(
        this.extractTag(entry, 'media:description') || ''
      ).substring(0, 500);

      const thumbnailMatch = entry.match(/media:thumbnail[^>]+url="([^"]+)"/);
      const thumbnailUrl = thumbnailMatch?.[1] || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      const viewCountMatch = entry.match(/media:statistics[^>]+views="(\d+)"/);
      const viewCount = viewCountMatch ? parseInt(viewCountMatch[1]) : 0;

      const isShort = /#shorts?\b/i.test(title) || /#shorts?\b/i.test(description) || title.toLowerCase().includes('#shorts') || description.toLowerCase().includes('#shorts');
      const url = isShort 
        ? `https://www.youtube.com/shorts/${videoId}` 
        : `https://www.youtube.com/watch?v=${videoId}`;

      if (videoId && title) {
        items.push({
          id: videoId,
          title,
          url,
          thumbnailUrl,
          description,
          publishedAt: published,
          viewCount,
          isShort,
          isLive: false,
          isPremiere: false,
          isCommunityPost: false,
          extra: { 
            'video.updated': updated,
            'provider': 'youtube',
            'sourceId': channelId,
            'contentType': isShort ? 'short' : 'video'
          }
        });
      }
    }

    return items;
  }

  private static extractTag(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.trim() || null;
  }

  private static decodeEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Scrape channel live stream status directly.
   */
  static async scrapeLiveStatus(channelId: string): Promise<ContentItem | null> {
    const url = `https://www.youtube.com/channel/${channelId}/live`;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return null;
      const html = await response.text();

      const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/) ||
                                  html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/) ||
                                  html.match(/window\[['"]ytInitialPlayerResponse['"]\]\s*=\s*(\{[\s\S]*?\});/);

      if (playerResponseMatch) {
        const playerResponseStr = playerResponseMatch[1];
        const isLive = playerResponseStr.includes('"isLive":true') || playerResponseStr.includes('"isLiveContent":true');
        const isPremiere = playerResponseStr.includes('"isPremiere":true');

        if (isLive || isPremiere) {
          const videoIdMatch = playerResponseStr.match(/"videoId":"([^"]+)"/);
          const videoId = videoIdMatch?.[1];

          if (videoId) {
            const titleMatch = playerResponseStr.match(/"videoDetails":\{[^}]*?"title":"([^"]+)"/) ||
                               playerResponseStr.match(/"title":"([^"]+)"/) ||
                               playerResponseStr.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
            const title = titleMatch?.[1] || titleMatch?.[2] || titleMatch?.[3] || 'Live Stream';

            const thumbMatch = playerResponseStr.match(/"playerMicroformatRenderer":[\s\S]*?"thumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/) ||
                               playerResponseStr.match(/"videoDetails":[\s\S]*?"thumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/) ||
                               playerResponseStr.match(/"thumbnails":\[\{"url":"([^"]+)"/);
            let thumbnailUrl = thumbMatch?.[1] || thumbMatch?.[2] || thumbMatch?.[3] || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            if (thumbnailUrl) {
              thumbnailUrl = thumbnailUrl.replace(/&amp;/g, '&');
            }

            return {
              id: videoId,
              title: title.replace(' - YouTube', ''),
              url: `https://www.youtube.com/watch?v=${videoId}`,
              thumbnailUrl,
              description: isLive ? 'Live Stream Started!' : 'Premiere Scheduled.',
              publishedAt: new Date().toISOString(),
              isLive,
              isPremiere,
              extra: {
                provider: 'youtube',
                sourceId: channelId,
                contentType: isLive ? 'live' : 'premiere'
              }
            };
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}
