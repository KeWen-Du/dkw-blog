import Link from 'next/link';
import { getAllPosts, formatDate } from '@/lib/posts';

export default async function PostsPage() {
  const posts = await getAllPosts();

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-12">
        文章
      </h1>

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
            <p className="text-[var(--muted)] mb-4 max-w-3xl">
              {post.excerpt}
            </p>
            <div className="flex flex-wrap gap-3">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tags/${encodeURIComponent(tag)}`}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
