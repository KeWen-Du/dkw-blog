import type { Post, Series } from './types';
import { getAllPostsSync } from './posts';

// 系列元数据配置
export const seriesConfig: Record<string, { title: string; description: string }> = {
  'iflow-cli-aicoding': {
    title: 'iFlow CLI AI Coding 最佳实践',
    description: '深入了解 iFlow CLI 的设计哲学与技术原理，探索 AI Coding 的新时代开发范式',
  },
  'llm-app-dev-tutorial': {
    title: '大模型应用开发教程',
    description: '从零开始，系统性地介绍大模型应用开发的各个方面，帮助你从理论到实践全面掌握这一前沿技术',
  },
  'llm-python-tutorial': {
    title: '大模型应用开发者 Python 必修课',
    description: '专为转型大模型应用开发的开发者打造，聚焦大模型开发所需的 Python 核心知识，助你快速入门',
  },
  'mini-opencode': {
    title: '从零到一实现 mini-opencode',
    description: '从零开始，逐步实现一个 mini 版本的 opencode，深入理解 AI 编程助手的核心原理',
  },
  'mini-mcp-gateway': {
    title: '从零到一实现 mini-mcp-gateway',
    description: '从零开始，逐步实现一个 MCP Gateway 项目，掌握 AI Agent 工具集成的核心技术',
  },
  'langchain4j-tutorial': {
    title: 'Langchain4J 实战教程',
    description: '系统学习 Langchain4J 框架，掌握 Java AI 应用开发的核心技能，构建企业级智能应用',
  },
};

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