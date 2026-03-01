import Link from 'next/link';
import { searchPosts } from '@/lib/search';
import Container from '@/components/Container';
import SearchInput from '@/components/SearchInput';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = q ? await searchPosts(q) : [];

  return (
    <Container className="py-12">
      <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-gray-100">搜索文章</h1>

      <div className="mb-8">
        <SearchInput />
      </div>

      {q && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            {results.length === 0
              ? '未找到相关文章'
              : `找到 ${results.length} 篇文章`}
          </p>

          {results.map((post) => (
            <article
              key={post.slug}
              className="p-6 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <Link href={`/posts/${post.slug}`}>
                <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                  {post.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-3">{post.excerpt}</p>
                <div className="flex items-center justify-between">
                  <time className="text-sm text-gray-500 dark:text-gray-500">{post.date}</time>
                  <div className="flex gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </Container>
  );
}