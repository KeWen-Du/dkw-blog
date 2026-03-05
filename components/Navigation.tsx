'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from './ThemeToggle';

const seriesConfig = [
  { slug: 'llm-python-tutorial', title: '大模型应用开发者 Python 必修课' },
  { slug: 'llm-app-dev-tutorial', title: '大模型应用开发教程' },
  { slug: 'iflow-cli-aicoding', title: 'iFlow CLI AI Coding 最佳实践' },
  { slug: 'mini-opencode', title: '从零到一实现 mini-opencode' },
  { slug: 'mini-mcp-gateway', title: '从零到一实现 mini-mcp-gateway' },
  { slug: 'redis-core-principles', title: 'Redis 底层原理' },
  { slug: 'kafka-core-principles', title: 'Kafka 核心原理' },
  { slug: 'langchain4j-tutorial', title: 'LangChain4j 实战教程' },
  { slug: 'spring-ai-tutorial', title: 'Spring AI 实战教程' },
];

const navLinks = [
  { href: '/', label: '首页' },
  { href: '/posts', label: '文章' },
  { href: '/series', label: '教程', hasDropdown: true },
  { href: '/tags', label: '标签' },
  { href: '/about', label: '关于' },
];

export default function Navigation() {
  const [isTutorialsOpen, setIsTutorialsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTutorialsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="h-16 border-b border-[var(--border)] bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <Link 
          href="/" 
          className="text-lg font-semibold tracking-tight text-[var(--foreground)]"
        >
          dkw-blog
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => 
              link.hasDropdown ? (
                <div key={link.href} className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsTutorialsOpen(!isTutorialsOpen)}
                    className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1 py-2"
                  >
                    {link.label}
                    <svg
                      className={`w-3 h-3 ${isTutorialsOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isTutorialsOpen && (
                    <div className="absolute top-full left-0 mt-1 w-72 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg py-2 z-50">
                      <Link
                        href="/series"
                        className="block px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"
                        onClick={() => setIsTutorialsOpen(false)}
                      >
                        全部系列
                      </Link>
                      <div className="h-px bg-[var(--border)] my-1" />
                      {seriesConfig.map((series) => (
                        <Link
                          key={series.slug}
                          href={`/series/${series.slug}`}
                          className="block px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"
                          onClick={() => setIsTutorialsOpen(false)}
                        >
                          {series.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] py-2"
                >
                  {link.label}
                </Link>
              )
            )}
          </div>
          
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}