import type { Post, Series } from './types';
import { getAllPostsSync } from './posts';

// 系列元数据配置
export const seriesConfig: Record<string, { title: string; description: string }> = {
  // AI 应用开发系列
  'prompt-engineering-tutorial': {
    title: '提示词工程实战教程',
    description: '系统掌握 Prompt Engineering 的核心技巧，从基础概念到高级模式，全面提升与大语言模型的交互效率',
  },
  'llm-python-tutorial': {
    title: '大模型应用开发者 Python 必修课',
    description: '专为转型大模型应用开发的开发者打造，聚焦大模型开发所需的 Python 核心知识，助你快速入门',
  },
  'llm-app-dev-tutorial': {
    title: '大模型应用开发教程',
    description: '从零开始，系统性地介绍大模型应用开发的各个方面，帮助你从理论到实践全面掌握这一前沿技术',
  },
  'iflow-cli-aicoding': {
    title: 'iFlow CLI AI Coding 最佳实践',
    description: '深入了解 iFlow CLI 的设计哲学与技术原理，探索 AI Coding 的新时代开发范式',
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
    title: 'LangChain4j 实战教程',
    description: '系统学习 LangChain4j 框架，掌握 Java AI 应用开发的核心技能，构建企业级智能应用',
  },
  'spring-ai-tutorial': {
    title: 'Spring AI 实战教程',
    description: '使用 Spring AI 框架构建企业级 AI 应用，掌握 Chat Client、RAG、Tools 等核心功能',
  },
  // 中间件核心原理系列
  'redis-core-principles': {
    title: 'Redis 底层原理',
    description: '从源码层面深入剖析 Redis 的数据结构、持久化、事件驱动、集群等核心机制',
  },
  'kafka-core-principles': {
    title: 'Kafka 核心原理',
    description: '深入理解 Kafka 的消息存储、生产者消费者、副本机制、性能优化等核心技术',
  },
  'dubbo-core-principles': {
    title: 'Dubbo 底层原理',
    description: '深入解析 Dubbo 的 SPI 机制、服务暴露引用、负载均衡、集群容错等核心原理',
  },
  'elasticsearch-core-principles': {
    title: 'Elasticsearch 核心原理',
    description: '深入理解 ES 的倒排索引、写入流程、查询执行、分布式架构等核心技术',
  },
  'flink-core-principles': {
    title: 'Flink 核心原理',
    description: '深入解析 Flink 的运行时架构、状态管理、容错机制、内存管理等核心原理',
  },
  // 数据库系列
  'mysql-slow-query-optimization': {
    title: 'MySQL 慢查询优化',
    description: '系统掌握慢查询诊断、执行计划分析、索引优化、SQL 重写等实战技能',
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