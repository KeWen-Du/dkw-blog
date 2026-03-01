import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getAllPostSlugs, getRelatedPosts } from '@/lib/posts';
import { siteConfig } from '@/lib/config';
import Container from '@/components/Container';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import TableOfContents from '@/components/TableOfContents';
import ShareButtons from '@/components/ShareButtons';

function generateJsonLd(post: any) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: [],
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: siteConfig.author.name,
      url: siteConfig.social.github,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.title,
      url: siteConfig.url,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.url}/posts/${post.slug}`,
    },
    keywords: post.tags.join(', '),
    wordCount: post.content.split(/\s+/).length,
    timeRequired: `${post.readingTime} minutes`,
  };
}

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: '文章不存在',
    };
  }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(slug, post.tags, 3);
  const jsonLd = generateJsonLd(post);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/posts"
            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-8"
          >
            ← 返回文章列表
          </Link>

          <div className="lg:flex lg:gap-12">
            <article className="lg:flex-1 min-w-0">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                {post.title}
              </h1>

              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-8">
                <div className="flex items-center gap-4">
                  <span>{post.date}</span>
                  <span>·</span>
                  <span>{post.readingTime} 分钟阅读</span>
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/tags/${tag}`}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
                <ShareButtons title={post.title} url={`${siteConfig.url}/posts/${post.slug}`} />
              </div>

              <div className="prose dark:prose-invert max-w-none prose-lg">
                <MarkdownRenderer content={post.content} />
              </div>

              {relatedPosts.length > 0 && (
                <div className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                    相关文章
                  </h2>
                  <div className="space-y-6">
                    {relatedPosts.map((relatedPost) => (
                      <Link
                        key={relatedPost.slug}
                        href={`/posts/${relatedPost.slug}`}
                        className="block p-4 bg-gray-50 dark:bg-gray-900 rounded-lg hover:shadow-md transition-shadow"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {relatedPost.title}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-2">
                          <span>{relatedPost.date}</span>
                          <span>·</span>
                          <span>{relatedPost.readingTime} 分钟阅读</span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                          {relatedPost.excerpt}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <TableOfContents />
          </div>
        </div>
      </div>
    </>
  );
}