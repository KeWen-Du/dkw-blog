import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeriesBySlug, getSeriesSlugs } from '@/lib/series';
import { formatDate } from '@/lib/posts';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getSeriesSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const series = getSeriesBySlug(slug);
  
  if (!series) {
    return { title: '系列未找到' };
  }

  return {
    title: series.title,
    description: series.description,
  };
}

export default async function SeriesDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const series = getSeriesBySlug(slug);

  if (!series) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      {/* Header */}
      <header className="mb-12">
        <Link
          href="/series"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4 inline-block"
        >
          ← 所有系列
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-4">
          {series.title}
        </h1>
        <p className="text-[var(--muted)] mb-4 max-w-3xl">
          {series.description}
        </p>
        <span className="text-sm text-[var(--muted)]">
          共 {series.posts.length} 篇文章
        </span>
      </header>

      {/* Posts List */}
      <div className="divide-y divide-[var(--border)]">
        {series.posts.map((post, index) => (
          <article key={post.slug} className="py-8 first:pt-0 last:pb-0">
            <Link href={`/posts/${post.slug}`} className="group flex gap-6">
              <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-sm font-medium text-[var(--muted)] border border-[var(--border)] rounded">
                {post.series?.order || index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                  {post.title}
                </h2>
                <div className="flex items-center gap-4 text-sm text-[var(--muted)] mb-2">
                  <span>{formatDate(post.date)}</span>
                  <span>·</span>
                  <span>{post.readingTime} 分钟阅读</span>
                </div>
                <p className="text-sm text-[var(--muted)] line-clamp-2">
                  {post.excerpt}
                </p>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}