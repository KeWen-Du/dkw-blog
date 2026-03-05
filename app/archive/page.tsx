import Link from 'next/link';
import { getPostsByYear } from '@/lib/archive';
import { formatDate } from '@/lib/posts';

export default async function ArchivePage() {
  const archive = await getPostsByYear();
  const years = Object.keys(archive).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-12">
        归档
      </h1>

      {years.length === 0 ? (
        <p className="text-[var(--muted)]">暂无文章</p>
      ) : (
        <div className="space-y-16">
          {years.map((year) => (
            <div key={year}>
              <h2 className="text-sm font-medium text-[var(--muted)] mb-6">
                {year}
              </h2>
              <div className="divide-y divide-[var(--border)]">
                {archive[year].map((post) => (
                  <article key={post.slug} className="py-6 first:pt-0 last:pb-0">
                    <Link href={`/posts/${post.slug}`} className="group block">
                      <div className="flex items-start gap-4">
                        <span className="text-sm text-[var(--muted)] w-24 shrink-0 pt-1">
                          {formatDate(post.date)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-medium text-[var(--foreground)] group-hover:underline underline-offset-4">
                            {post.title}
                          </h3>
                          <p className="text-sm text-[var(--muted)] mt-1 line-clamp-1">
                            {post.excerpt}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
