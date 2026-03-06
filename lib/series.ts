import type { Post, Series } from './types';
import { getAllPostsSync } from './posts';
import { seriesConfig } from './series-config';

// 重新导出 seriesConfig 供其他模块使用
export { seriesConfig } from './series-config';

export function getAllSeries(): Series[] {
  const allPosts = getAllPostsSync();
  
  const seriesMap = new Map<string, Post[]>();
  
  // 按系列分组
  allPosts.forEach((post: Post) => {
    if (post.series) {
      const seriesSlug = post.series.slug;
      if (!seriesMap.has(seriesSlug)) {
        seriesMap.set(seriesSlug, []);
      }
      seriesMap.get(seriesSlug)!.push(post);
    }
  });
  
  // 构建系列数据
  const seriesList: Series[] = [];
  
  seriesMap.forEach((posts, slug) => {
    const config = seriesConfig[slug];
    if (config) {
      // 按 order 排序
      const sortedPosts = [...posts].sort((a, b) => {
        const orderA = a.series?.order || 0;
        const orderB = b.series?.order || 0;
        return orderA - orderB;
      });
      
      seriesList.push({
        slug,
        title: config.title,
        description: config.description,
        posts: sortedPosts,
      });
    }
  });
  
  return seriesList;
}

export function getSeriesBySlug(slug: string): Series | null {
  const allSeries = getAllSeries();
  return allSeries.find((series) => series.slug === slug) || null;
}

export function getSeriesSlugs(): string[] {
  return Object.keys(seriesConfig);
}
