'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import { seriesConfig as seriesConfigMap } from '@/lib/series-config';

// 将 seriesConfig 转换为数组格式用于下拉菜单
const seriesConfig = Object.entries(seriesConfigMap).map(([slug, config]) => ({
  slug,
  title: config.title,
}));

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
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo */}
        <Link 
          href="/" 
          className="text-lg font-semibold tracking-tight text-[var(--foreground)]"
        >
          dkw-blog
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-6">
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
          
          {/* Search Button */}
          <Link
            href="/search"
            className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="搜索"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </Link>
          
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}