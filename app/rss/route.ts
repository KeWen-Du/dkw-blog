import { getAllPosts } from '@/lib/posts';
import { siteConfig } from '@/lib/config';

export async function GET() {
  const posts = await getAllPosts();

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${siteConfig.title}</title>
    <link>${siteConfig.url}</link>
    <description>${siteConfig.description}</description>
    <language>zh-CN</language>
    ${posts
      .map(
        (post) => `
      <item>
        <title>${post.title}</title>
        <link>${siteConfig.url}/posts/${post.slug}</link>
        <description>${post.excerpt}</description>
        <pubDate>${new Date(post.date).toUTCString()}</pubDate>
        <guid>${siteConfig.url}/posts/${post.slug}</guid>
      </item>
    `
      )
      .join('')}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}