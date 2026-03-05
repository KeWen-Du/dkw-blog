import Link from "next/link";
import { getAllPosts, formatDate } from "@/lib/posts";

export default async function Home() {
  const posts = await getAllPosts();
  const latestPosts = posts.slice(0, 6);

  return (
    <div className="min-h-screen">
      {/* Hero Section - Minimal & Clean */}
      <section className="py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-[var(--foreground)] mb-6">
            你好，我是 KeWen Du
          </h1>
          <p className="text-lg md:text-xl text-[var(--muted)] max-w-2xl mb-8">
            5年后端开发 · 大模型应用开发工程师 · 独立开发者
          </p>
          <p className="text-base text-[var(--muted)] max-w-2xl mb-12">
            专注于构建高性能、可扩展的 Web 应用和分布式系统，探索 AI 技术在实际业务中的应用
          </p>
          <div className="flex gap-4">
            <Link
              href="/posts"
              className="px-6 py-3 bg-[var(--accent)] text-[var(--accent-foreground)] text-sm font-medium rounded-lg hover:opacity-90"
            >
              阅读文章
            </Link>
            <Link
              href="/about"
              className="px-6 py-3 border border-[var(--border)] text-sm font-medium rounded-lg hover:bg-[var(--card)] text-[var(--foreground)]"
            >
              关于我
            </Link>
          </div>
        </div>
      </section>

      {/* Latest Posts Section */}
      <section className="py-16 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              最新文章
            </h2>
            <Link
              href="/posts"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              查看全部 →
            </Link>
          </div>

          {latestPosts.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {latestPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/posts/${post.slug}`}
                  className="group block p-6 rounded-lg border border-[var(--border)] hover:border-[var(--muted)] hover:bg-[var(--card)]"
                >
                  <div className="text-xs text-[var(--muted)] mb-3">
                    {formatDate(post.date)}
                  </div>
                  <h3 className="text-lg font-medium text-[var(--foreground)] mb-3 group-hover:underline underline-offset-4">
                    {post.title}
                  </h3>
                  <p className="text-sm text-[var(--muted)] mb-4 line-clamp-2">
                    {post.excerpt}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs text-[var(--muted)]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-[var(--muted)] mb-6">暂无文章</p>
              <Link
                href="/about"
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                了解更多 →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Quick Links Section */}
      <section className="py-16 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] mb-12">
            探索
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/tags"
              className="group p-6 rounded-lg border border-[var(--border)] hover:border-[var(--muted)]"
            >
              <h3 className="text-base font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                标签
              </h3>
              <p className="text-sm text-[var(--muted)]">按主题浏览文章</p>
            </Link>

            <Link
              href="/archive"
              className="group p-6 rounded-lg border border-[var(--border)] hover:border-[var(--muted)]"
            >
              <h3 className="text-base font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                归档
              </h3>
              <p className="text-sm text-[var(--muted)]">按时间查看文章</p>
            </Link>

            <Link
              href="/search"
              className="group p-6 rounded-lg border border-[var(--border)] hover:border-[var(--muted)]"
            >
              <h3 className="text-base font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                搜索
              </h3>
              <p className="text-sm text-[var(--muted)]">查找感兴趣的内容</p>
            </Link>

            <Link
              href="/rss"
              className="group p-6 rounded-lg border border-[var(--border)] hover:border-[var(--muted)]"
            >
              <h3 className="text-base font-medium text-[var(--foreground)] mb-2 group-hover:underline underline-offset-4">
                RSS
              </h3>
              <p className="text-sm text-[var(--muted)]">订阅最新更新</p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}