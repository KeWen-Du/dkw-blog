import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPostBySlug, getAllPostSlugs, getRelatedPosts, formatDate } from '@/lib/posts';
import { siteConfig } from '@/lib/config';
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
    return { title: '文章不存在' };
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
      <article className="max-w-6xl mx-auto px-6 py-16">
        {/* Back Link */}
        <Link
          href="/posts"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-8 inline-block"
        >
          ← 返回文章列表
        </Link>

        <div className="lg:flex lg:gap-16">
          {/* Main Content */}
          <div className="lg:flex-1 min-w-0">
            {/* Header */}
            <header className="mb-12">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--foreground)] mb-6">
                {post.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
                <span>{formatDate(post.date)}</span>
                <span>·</span>
                <span>{post.readingTime} 分钟阅读</span>
              </div>
              <div className="flex items-center gap-3 mt-4">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </header>

            {/* Content */}
            <div className="prose dark:prose-invert max-w-none">
              <MarkdownRenderer content={post.content} url={`${siteConfig.url}/posts/${post.slug}`} />
            </div>

            {/* Share */}
            <div className="mt-12 pt-8 border-t border-[var(--border)]">
              <ShareButtons title={post.title} url={`${siteConfig.url}/posts/${post.slug}`} />
            </div>

            {/* Related Posts */}
            {relatedPosts.length > 0 && (
              <div className="mt-16">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)] mb-8">
                  相关文章
                </h2>
                <div className="divide-y divide-[var(--border)]">
                  {relatedPosts.map((relatedPost) => (
                    <Link
                      key={relatedPost.slug}
                      href={`/posts/${relatedPost.slug}`}
                      className="group block py-6 first:pt-0"
                    >
                      <h3 className="text-lg font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                        {relatedPost.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-[var(--muted)] mb-2">
                        <span>{formatDate(relatedPost.date)}</span>
                        <span>·</span>
                        <span>{relatedPost.readingTime} 分钟阅读</span>
                      </div>
                      <p className="text-sm text-[var(--muted)]">
                        {relatedPost.excerpt}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Table of Contents */}
          <aside className="hidden lg:block">
            <TableOfContents />
          </aside>
        </div>
      </article>
    </>
  );
}
