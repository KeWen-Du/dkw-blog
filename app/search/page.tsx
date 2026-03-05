import Link from 'next/link';
import { searchPosts } from '@/lib/search';
import SearchInput from '@/components/SearchInput';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = q ? await searchPosts(q) : [];

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-12">
        搜索
      </h1>

      <div className="mb-12">
        <SearchInput />
      </div>

      {q && (
        <div>
          <p className="text-sm text-[var(--muted)] mb-8">
            {results.length === 0
              ? '未找到相关文章'
              : `找到 ${results.length} 篇文章`}
          </p>

          <div className="divide-y divide-[var(--border)]">
            {results.map((post) => (
              <article key={post.slug} className="py-8 first:pt-0 last:pb-0">
                <Link href={`/posts/${post.slug}`} className="group block">
                  <h2 className="text-xl font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                    {post.title}
                  </h2>
                </Link>
                <p className="text-[var(--muted)] mb-3 max-w-3xl">
                  {post.excerpt}
                </p>
                <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
                  <span>{post.date}</span>
                  <div className="flex gap-3">
                    {post.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
