import Link from 'next/link';
import { getAllTags } from '@/lib/tags';
import { TAG_COLORS } from '@/lib/config';
import Container from '@/components/Container';

export default async function TagsPage() {
  const tags = await getAllTags();

  return (
    <Container className="py-12">
      <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-gray-100">所有标签</h1>

      <div className="flex flex-wrap gap-3">
        {tags.map((tag, index) => {
          const colorClass = TAG_COLORS[index % TAG_COLORS.length];
          return (
            <Link
              key={tag}
              href={`/tags/${tag}`}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-transform hover:scale-105 ${colorClass}`}
            >
              {tag}
            </Link>
          );
        })}
      </div>

      {tags.length === 0 && (
        <p className="text-gray-600 dark:text-gray-400">暂无标签</p>
      )}
    </Container>
  );
}