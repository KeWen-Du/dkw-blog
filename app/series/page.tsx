import Link from 'next/link';
import { getAllSeries } from '@/lib/series';

export default function SeriesPage() {
  const seriesList = getAllSeries();

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-12">
        教程系列
      </h1>

      <div className="divide-y divide-[var(--border)]">
        {seriesList.map((series) => (
          <article key={series.slug} className="py-8 first:pt-0 last:pb-0">
            <Link href={`/series/${series.slug}`} className="group block">
              <h2 className="text-xl font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                {series.title}
              </h2>
            </Link>
            <p className="text-[var(--muted)] mb-3 max-w-3xl">
              {series.description}
            </p>
            <span className="text-sm text-[var(--muted)]">
              共 {series.posts.length} 篇文章
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}