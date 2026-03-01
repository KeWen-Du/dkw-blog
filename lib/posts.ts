import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { Post } from './types';

const postsDirectory = path.join(process.cwd(), 'posts');

interface PostFrontmatter {
  title: string;
  date: string;
  excerpt?: string;
  tags?: string[];
  [key: string]: any;
}

function validateFrontmatter(data: any): PostFrontmatter {
  if (!data.title || typeof data.title !== 'string') {
    throw new Error('Invalid or missing title in frontmatter');
  }

  if (!data.date || typeof data.date !== 'string') {
    throw new Error('Invalid or missing date in frontmatter');
  }

  const date = new Date(data.date);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format in frontmatter');
  }

  return {
    title: data.title,
    date: data.date,
    excerpt: data.excerpt || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
  };
}

function calculateReadingTime(content: string): number {
  const wordsPerMinute = 400;
  const wordCount = content.trim().split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

export async function getAllPosts(): Promise<Post[]> {
  try {
    if (!fs.existsSync(postsDirectory)) {
      console.warn('Posts directory does not exist');
      return [];
    }

    const fileNames = fs.readdirSync(postsDirectory);
    const allPostsData = fileNames
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => {
        const slug = fileName.replace(/\.md$/, '');
        const fullPath = path.join(postsDirectory, fileName);
        
        try {
          const fileContents = fs.readFileSync(fullPath, 'utf8');
          const { data, content } = matter(fileContents);
          const frontmatter = validateFrontmatter(data);

          return {
            slug,
            title: frontmatter.title,
            date: frontmatter.date,
            excerpt: frontmatter.excerpt,
            tags: frontmatter.tags,
            content,
            readingTime: calculateReadingTime(content),
          };
        } catch (error) {
          console.error(`Error parsing file ${fileName}:`, error);
          return null;
        }
      })
      .filter((post): post is Post => post !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return allPostsData;
  } catch (error) {
    console.error('Error reading posts:', error);
    return [];
  }
}

export function getPostBySlug(slug: string): Post | null {
  try {
    const fullPath = path.join(postsDirectory, `${slug}.md`);
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);
    const frontmatter = validateFrontmatter(data);

    return {
      slug,
      title: frontmatter.title,
      date: frontmatter.date,
      excerpt: frontmatter.excerpt || '',
      tags: frontmatter.tags || [],
      content,
      readingTime: calculateReadingTime(content),
    };
  } catch (error) {
    console.error(`Error reading post ${slug}:`, error);
    return null;
  }
}

export function getAllPostSlugs(): string[] {
  try {
    if (!fs.existsSync(postsDirectory)) {
      return [];
    }

    const fileNames = fs.readdirSync(postsDirectory);
    return fileNames
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => fileName.replace(/\.md$/, ''));
  } catch (error) {
    console.error('Error reading post slugs:', error);
    return [];
  }
}

export function getRelatedPosts(currentSlug: string, currentTags: string[], limit: number = 3): Post[] {
  const allPosts = getAllPostsSync();
  const relatedPosts = allPosts
    .filter((post) => post.slug !== currentSlug)
    .map((post) => {
      const commonTags = post.tags.filter((tag) => currentTags.includes(tag));
      return {
        ...post,
        commonTagsCount: commonTags.length,
      };
    })
    .filter((post) => post.commonTagsCount > 0)
    .sort((a, b) => b.commonTagsCount - a.commonTagsCount)
    .slice(0, limit)
    .map(({ commonTagsCount, ...post }) => post);

  return relatedPosts;
}

function getAllPostsSync(): Post[] {
  try {
    if (!fs.existsSync(postsDirectory)) {
      return [];
    }

    const fileNames = fs.readdirSync(postsDirectory);
    const allPostsData = fileNames
      .filter((fileName) => fileName.endsWith('.md'))
      .map((fileName) => {
        const slug = fileName.replace(/\.md$/, '');
        const fullPath = path.join(postsDirectory, fileName);
        
        try {
          const fileContents = fs.readFileSync(fullPath, 'utf8');
          const { data, content } = matter(fileContents);
          const frontmatter = validateFrontmatter(data);

          return {
            slug,
            title: frontmatter.title,
            date: frontmatter.date,
            excerpt: frontmatter.excerpt,
            tags: frontmatter.tags,
            content,
            readingTime: calculateReadingTime(content),
          };
        } catch (error) {
          console.error(`Error parsing file ${fileName}:`, error);
          return null;
        }
      })
      .filter((post): post is Post => post !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return allPostsData;
  } catch (error) {
    console.error('Error reading posts:', error);
    return [];
  }
}