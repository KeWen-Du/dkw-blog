import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import Container from '@/components/Container';

export default async function PostsPage() {
  const posts = await getAllPosts();

  return (
    <Container className="py-12">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-8">
        文章列表
      </h1>

      <div className="space-y-8">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg hover:shadow-lg transition-shadow"
          >
            <Link href={`/posts/${post.slug}`}>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {post.title}
              </h2>
            </Link>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
              <span>{post.date}</span>
              <span>·</span>
              <span>{post.readingTime} 分钟阅读</span>
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tags/${tag}`}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              {post.excerpt}
            </p>
            <Link
              href={`/posts/${post.slug}`}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              阅读更多 →
            </Link>
          </article>
        ))}
      </div>
    </Container>
  );
}