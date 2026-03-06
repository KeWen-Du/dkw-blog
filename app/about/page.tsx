import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      {/* Header */}
      <header className="mb-16">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] mb-4">
          关于我
        </h1>
        <p className="text-lg text-[var(--muted)]">
          5年后端开发 · 大模型应用开发工程师 · 独立开发者
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-16">
        {/* Sidebar */}
        <aside className="lg:col-span-4 mb-12 lg:mb-0">
          <div className="p-6 border border-[var(--border)] rounded-lg mb-6">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden ring-2 ring-[var(--border)] ring-offset-2 ring-offset-[var(--background)]">
              <Image
                src="/avatar.jpeg"
                alt="KeWen Du"
                width={96}
                height={96}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <h2 className="text-xl font-semibold text-center text-[var(--foreground)] mb-2">
              KeWen Du
            </h2>
            <p className="text-sm text-center text-[var(--muted)] mb-6">
              dkewen666@gmail.com
            </p>
            <div className="flex justify-center">
              <a 
                href="https://github.com/KeWen-Du" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                GitHub →
              </a>
            </div>
          </div>

          <div className="p-6 border border-[var(--border)] rounded-lg">
            <h3 className="text-sm font-medium text-[var(--foreground)] mb-4">基本信息</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">地点</span>
                <span className="text-[var(--foreground)]">中国</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">经验</span>
                <span className="text-[var(--foreground)]">5年</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">语言</span>
                <span className="text-[var(--foreground)]">中文 / English</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-8 space-y-12">
          {/* Bio */}
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] mb-4">简介</h2>
            <p className="text-[var(--foreground)] leading-relaxed mb-4">
              我是一名拥有5年经验的后端开发工程师、大模型应用开发工程师和独立开发者。专注于构建高性能、可扩展的 Web 应用和分布式系统，同时热衷于探索 AI 技术在实际业务中的应用。
            </p>
            <p className="text-[var(--foreground)] leading-relaxed">
              在工作中，我主要负责后端架构设计和系统优化。在业余时间，我积极开发开源项目、学习前沿技术，并通过博客分享我的技术经验和见解。
            </p>
          </section>

          {/* Tech Stack */}
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] mb-6">技术栈</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">后端</h3>
                <div className="flex flex-wrap gap-2">
                  {['Java', 'Spring Boot', 'Node.js', 'Python', 'Go'].map((tech) => (
                    <span key={tech} className="px-3 py-1 text-xs border border-[var(--border)] rounded text-[var(--muted)]">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">前端</h3>
                <div className="flex flex-wrap gap-2">
                  {['React', 'Next.js', 'TypeScript', 'Tailwind CSS'].map((tech) => (
                    <span key={tech} className="px-3 py-1 text-xs border border-[var(--border)] rounded text-[var(--muted)]">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">中间件</h3>
                <div className="flex flex-wrap gap-2">
                  {['Redis', 'Kafka', 'RocketMQ', 'MySQL', 'Elasticsearch'].map((tech) => (
                    <span key={tech} className="px-3 py-1 text-xs border border-[var(--border)] rounded text-[var(--muted)]">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">AI / LLM</h3>
                <div className="flex flex-wrap gap-2">
                  {['OpenAI API', 'Claude API', 'MCP', 'RAG', 'LangChain4j', 'Spring AI'].map((tech) => (
                    <span key={tech} className="px-3 py-1 text-xs border border-[var(--border)] rounded text-[var(--muted)]">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">开发工具</h3>
                <div className="flex flex-wrap gap-2">
                  {['Git', 'Docker', 'Kubernetes', 'CI/CD'].map((tech) => (
                    <span key={tech} className="px-3 py-1 text-xs border border-[var(--border)] rounded text-[var(--muted)]">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Focus Areas */}
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] mb-6">关注领域</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { title: '高并发系统', desc: '分布式架构设计' },
                { title: '大数据处理', desc: '实时分析与处理' },
                { title: 'AI 应用开发', desc: '智能应用集成' },
                { title: '全栈开发', desc: '端到端解决方案' },
              ].map((item) => (
                <div key={item.title} className="p-4 border border-[var(--border)] rounded-lg">
                  <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[var(--muted)]">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Projects */}
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] mb-6">精选项目</h2>
            <div className="space-y-4">
              <a
                href="https://github.com/KeWen-Du/iflow-run"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 border border-[var(--border)] rounded-lg hover:border-[var(--muted)]"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-medium text-[var(--foreground)]">iFlow-run</h3>
                  <span className="text-xs text-[var(--muted)]">TypeScript</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  iFlow CLI 会话可视化管理工具，支持会话浏览、消息过滤、Token 统计、会话导出等功能。
                </p>
              </a>
              <a
                href="https://github.com/KeWen-Du/nano-agent"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 border border-[var(--border)] rounded-lg hover:border-[var(--muted)]"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-medium text-[var(--foreground)]">nano-agent</h3>
                  <span className="text-xs text-[var(--muted)]">TypeScript</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  生产级 AI 编程助手，支持多模型接入、MCP 工具调用、Agent 循环、多 Agent 协作、TUI 终端界面。
                </p>
              </a>
              <a
                href="https://github.com/KeWen-Du/mcp-gateway-core"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-6 border border-[var(--border)] rounded-lg hover:border-[var(--muted)]"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-base font-medium text-[var(--foreground)]">mcp-gateway-core</h3>
                  <span className="text-xs text-[var(--muted)]">Python</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  生产级 MCP Gateway，基于 FastAPI 实现，支持 MCP 协议、认证授权、限流熔断、可观测性等企业级特性。
                </p>
              </a>
            </div>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] mb-6">联系方式</h2>
            <div className="flex flex-wrap gap-4">
              <a 
                href="mailto:dkewen666@gmail.com"
                className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]"
              >
                dkewen666@gmail.com
              </a>
              <a 
                href="mailto:dkewenjob@foxmail.com"
                className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]"
              >
                dkewenjob@foxmail.com
              </a>
              <a 
                href="https://github.com/KeWen-Du" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--muted)]"
              >
                GitHub
              </a>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
