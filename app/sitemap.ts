import { getAllPostSlugs } from '@/lib/posts';
import { siteConfig } from '@/lib/config';

export default function sitemap() {
  const posts = getAllPostSlugs();

  return [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${siteConfig.url}/posts`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/tags`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
    {
      url: `${siteConfig.url}/archive`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
    {
      url: `${siteConfig.url}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    ...posts.map((slug) => ({
      url: `${siteConfig.url}/posts/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
  ];
}