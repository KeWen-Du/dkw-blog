import Container from "@/components/Container";

export default function AboutPage() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            About Me
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            5年后端开发 · 大模型应用开发工程师 · 独立开发者
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
              <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-center mb-2">KeWen Du</h2>
              <p className="text-center text-white/80 mb-6">dkewen666@gmail.com</p>
              <div className="flex justify-center gap-4">
                <a href="https://github.com/KeWen-Du" target="_blank" rel="noopener noreferrer" className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </a>
              </div>
            </div>

            <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">基本信息</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🇨🇳</span>
                  <span className="text-gray-700 dark:text-gray-300">中国</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💼</span>
                  <span className="text-gray-700 dark:text-gray-300">顺丰科技</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <span className="text-gray-700 dark:text-gray-300">5年后端开发经验</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🤖</span>
                  <span className="text-gray-700 dark:text-gray-300">大模型应用开发工程师</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🚀</span>
                  <span className="text-gray-700 dark:text-gray-300">独立开发者</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎓</span>
                  <span className="text-gray-700 dark:text-gray-300">计算机科学</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🌍</span>
                  <span className="text-gray-700 dark:text-gray-300">English / 中文</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <span>👋</span> 你好
              </h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                我是一名拥有5年经验的后端开发工程师、大模型应用开发工程师和独立开发者。专注于构建高性能、可扩展的 Web 应用和分布式系统，同时热衷于探索 AI 技术在实际业务中的应用。
              </p>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                在工作中，我主要负责后端架构设计和系统优化。在业余时间，我积极开发开源项目、学习前沿技术，并通过博客分享我的技术经验和见解。
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                <span>💡</span> 技术栈
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">后端</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">Java</span>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded">Spring</span>
                    <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded">Node.js</span>
                    <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs rounded">Python</span>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">前端</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 text-xs rounded">React</span>
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">Next.js</span>
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">Flutter</span>
                    <span className="px-2 py-1 bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 text-xs rounded">Tailwind</span>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">中间件</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs rounded">Redis</span>
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs rounded">Kafka</span>
                    <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 text-xs rounded">RocketMQ</span>
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">MySQL</span>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">AI & 工具</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs rounded">LangChain</span>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded">FastAPI</span>
                    <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 text-xs rounded">Git</span>
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">Docker</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                <span>🎯</span> 关注领域
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
                  <span className="text-2xl">🚀</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">高并发系统</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">分布式架构设计</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
                  <span className="text-2xl">📊</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">大数据处理</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">实时分析与处理</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl">
                  <span className="text-2xl">🤖</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI 应用开发</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">智能应用集成</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl">
                  <span className="text-2xl">💻</span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">全栈开发</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">端到端解决方案</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                <span>🚀</span> 精选项目
              </h2>
              <div className="space-y-4">
                <a href="https://github.com/KeWen-Du/iflow-run" target="_blank" rel="noopener noreferrer" className="block p-6 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">iFlow-run</h3>
                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">Node.js</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">iFlow CLI 会话可视化管理工具，支持会话浏览、消息过滤、Token 统计等功能。</p>
                </a>
                <a href="https://github.com/KeWen-Du/smart-ledger" target="_blank" rel="noopener noreferrer" className="block p-6 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Smart Ledger</h3>
                    <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">Flutter</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">AI 智能记账应用，支持对话式记账、个性化账本推荐和财务建议。</p>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
          <h2 className="text-2xl font-bold mb-4 text-center">📬 让我们联系吧</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="mailto:dkewen666@gmail.com" className="flex items-center gap-2 px-6 py-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
              <span>📧</span>
              <span>dkewen666@gmail.com</span>
            </a>
            <a href="mailto:dkewenjob@foxmail.com" className="flex items-center gap-2 px-6 py-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
              <span>💼</span>
              <span>dkewenjob@foxmail.com</span>
            </a>
            <a href="https://github.com/KeWen-Du" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
              <span>🐙</span>
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}