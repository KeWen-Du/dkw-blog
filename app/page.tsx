import Link from "next/link";
import { getAllPosts, formatDate } from "@/lib/posts";

export default async function Home() {
  const posts = await getAllPosts();
  const latestPosts = posts.slice(0, 3);

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-32">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              你好，我是 KeWen Du
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
              5年后端开发 · 大模型应用开发工程师 · 独立开发者
            </p>
            <p className="text-lg text-white/80 mb-12 max-w-2xl mx-auto">
              专注于构建高性能、可扩展的 Web 应用和分布式系统，探索 AI 技术在实际业务中的应用
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/posts"
                className="px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors shadow-lg"
              >
                阅读文章
              </Link>
              <Link
                href="/about"
                className="px-8 py-4 bg-transparent border-2 border-white text-white font-semibold rounded-lg hover:bg-white/10 transition-colors"
              >
                关于我
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            最新文章
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            分享技术见解和开发经验
          </p>
        </div>

        {latestPosts.length > 0 ? (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {latestPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/posts/${post.slug}`}
                className="group block p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                  <span>{formatDate(post.date)}</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {post.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              暂无文章，敬请期待
            </p>
            <Link
              href="/about"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              了解更多
            </Link>
          </div>
        )}

        {posts.length > 3 && (
          <div className="text-center mt-12">
            <Link
              href="/posts"
              className="inline-flex items-center gap-2 px-6 py-3 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              查看所有文章
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              探索更多
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              发现博客的其他功能
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/tags"
              className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all duration-300 text-center"
            >
              <div className="text-4xl mb-4">🏷️</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">标签</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">按主题浏览文章</p>
            </Link>

            <Link
              href="/archive"
              className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all duration-300 text-center"
            >
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">归档</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">按时间查看文章</p>
            </Link>

            <Link
              href="/search"
              className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all duration-300 text-center"
            >
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">搜索</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">查找感兴趣的内容</p>
            </Link>

            <Link
              href="/rss"
              className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all duration-300 text-center"
            >
              <div className="text-4xl mb-4">📡</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">RSS</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">订阅最新更新</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
