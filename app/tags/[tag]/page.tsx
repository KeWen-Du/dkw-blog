import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostsByTag, getAllTags } from '@/lib/tags';
import Container from '@/components/Container';

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
    <Container className="py-12">
      <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-gray-100">
        标签: {decodedTag}
      </h1>

      <div className="space-y-6">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="p-6 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
          >
            <Link href={`/posts/${post.slug}`}>
              <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                {post.title}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-3">{post.excerpt}</p>
              <time className="text-sm text-gray-500 dark:text-gray-500">{post.date}</time>
            </Link>
          </article>
        ))}
      </div>
    </Container>
  );
}