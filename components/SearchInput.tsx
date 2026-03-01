'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const savedHistory = localStorage.getItem('searchHistory');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const newHistory = [query, ...history.filter((h) => h !== query)].slice(0, 5);
      setHistory(newHistory);
      localStorage.setItem('searchHistory', JSON.stringify(newHistory));
      router.push(`/search?q=${encodeURIComponent(query)}`);
      setShowHistory(false);
    }
  };

  const handleHistoryClick = (term: string) => {
    setQuery(term);
    router.push(`/search?q=${encodeURIComponent(term)}`);
    setShowHistory(false);
  };

  return (
    <div className="relative">
      <form method="get" action="/search" onSubmit={handleSubmit}>
        <input
          type="text"
          name="q"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowHistory(e.target.value === '');
          }}
          onFocus={() => setShowHistory(query === '' && history.length > 0)}
          onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          placeholder="输入关键词搜索文章..."
          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </form>

      {showHistory && history.length > 0 && (
        <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">搜索历史</p>
          </div>
          <ul>
            {history.map((term, index) => (
              <li
                key={index}
                className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                onClick={() => handleHistoryClick(term)}
              >
                <span className="text-gray-900 dark:text-gray-100">{term}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}