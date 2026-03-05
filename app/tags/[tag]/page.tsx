import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostsByTag, getAllTags } from '@/lib/tags';
import { formatDate } from '@/lib/posts';

export async function generateStaticParams() {
  const tags = await getAllTags();
  return tags.map((tag) => ({ tag: encodeURIComponent(tag) }));
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const posts = await getPostsByTag(decodedTag);

  if (posts.length === 0) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="mb-12">
        <Link 
          href="/tags" 
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] mb-4 inline-block"
        >
          ← 所有标签
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
          #{decodedTag}
        </h1>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {posts.map((post) => (
          <article key={post.slug} className="py-8 first:pt-0 last:pb-0">
            <Link href={`/posts/${post.slug}`} className="group block">
              <h2 className="text-xl font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                {post.title}
              </h2>
            </Link>
            <div className="flex items-center gap-4 text-sm text-[var(--muted)] mb-3">
              <span>{formatDate(post.date)}</span>
              <span>·</span>
              <span>{post.readingTime} 分钟阅读</span>
            </div>
            <p className="text-[var(--muted)] max-w-3xl">
              {post.excerpt}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
