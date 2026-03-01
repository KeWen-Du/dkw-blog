import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          欢迎来到 dkw-blog
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          探索技术，分享知识
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 mb-12">
        <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
            最新文章
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            查看最新的技术文章和教程
          </p>
          <Link
            href="/posts"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            浏览文章
          </Link>
        </div>

        <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
            关于我
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            了解更多关于我的信息
          </p>
          <Link
            href="/about"
            className="inline-block px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            了解更多
          </Link>
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          技术栈
        </h3>
        <div className="flex flex-wrap justify-center gap-3">
          <span className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm">
            Next.js
          </span>
          <span className="px-4 py-2 bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 rounded-full text-sm">
            TypeScript
          </span>
          <span className="px-4 py-2 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm">
            Tailwind CSS
          </span>
          <span className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full text-sm">
            Vercel
          </span>
        </div>
      </div>
    </div>
  );
}
