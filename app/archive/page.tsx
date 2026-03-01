import Link from 'next/link';
import { getPostsByYear } from '@/lib/archive';
import Container from '@/components/Container';

export default async function ArchivePage() {
  const archive = await getPostsByYear();
  const years = Object.keys(archive).sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <Container className="py-12">
      <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-gray-100">文章归档</h1>

      {years.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">暂无文章</p>
      ) : (
        <div className="space-y-12">
          {years.map((year) => (
            <div key={year}>
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
                {year} 年
              </h2>
              <div className="space-y-4">
                {archive[year].map((post) => (
                  <article
                    key={post.slug}
                    className="p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  >
                    <Link href={`/posts/${post.slug}`}>
                      <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                        {post.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-2">{post.excerpt}</p>
                      <time className="text-sm text-gray-500 dark:text-gray-500">{post.date}</time>
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}