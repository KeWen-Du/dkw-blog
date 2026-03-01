export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-8">
        关于我
      </h1>

      <div className="prose dark:prose-invert max-w-none">
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
          你好！欢迎来到我的个人博客。
        </p>

        <p className="text-gray-700 dark:text-gray-300 mb-6">
          这是一个使用 Next.js 搭建的技术博客，我在这里分享我的学习心得、技术见解和项目经验。
        </p>

        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
          技术兴趣
        </h2>

        <ul className="list-disc ml-6 text-gray-700 dark:text-gray-300 mb-6">
          <li>前端开发（React、Next.js、Vue）</li>
          <li>后端开发（Node.js、Python）</li>
          <li>全栈开发</li>
          <li>开源项目</li>
          <li>云服务与 DevOps</li>
        </ul>

        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4">
          联系方式
        </h2>

        <p className="text-gray-700 dark:text-gray-300 mb-6">
          如果你想与我交流，可以通过以下方式联系我：
        </p>

        <div className="space-y-2 text-gray-700 dark:text-gray-300">
          <p>📧 Email: your.email@example.com</p>
          <p>🐙 GitHub: github.com/yourusername</p>
        </div>
      </div>
    </div>
  );
}