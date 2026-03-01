'use client';

import { useEffect, useState } from 'react';

export default function TableOfContents() {
  const [headings, setHeadings] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const extractHeadings = () => {
      const elements = document.querySelectorAll('article h1, article h2, article h3');
      const newHeadings = Array.from(elements).map((el) => ({
        id: el.id || '',
        text: el.textContent || '',
        level: parseInt(el.tagName[1]),
      })).filter(h => h.id); // 只保留有 id 的标题
      setHeadings(newHeadings);
    };

    extractHeadings();

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      extractHeadings();
    });

    const article = document.querySelector('article');
    if (article) {
      observer.observe(article, { childList: true, subtree: true });
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (headings.length === 0) return null;

  return (
    <nav className="hidden lg:block w-64 flex-shrink-0">
      <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">目录</h3>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            aria-label={isCollapsed ? '展开目录' : '折叠目录'}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
        </div>

        {!isCollapsed && (
          <ul className="space-y-2">
            {headings.map((heading) => (
              <li
                key={heading.id}
                style={{ marginLeft: `${(heading.level - 1) * 16}px` }}
                className="text-sm"
              >
                <button
                  onClick={() => scrollToHeading(heading.id)}
                  className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left w-full break-words"
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}