import Link from 'next/link';
import { getAllTags } from '@/lib/tags';

export default async function TagsPage() {
  const tags = await getAllTags();

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-12">
        标签
      </h1>

      {tags.length === 0 ? (
        <p className="text-[var(--muted)]">暂无标签</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/tags/${tag}`}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
