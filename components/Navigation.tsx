import Link from 'next/link';
import Container from './Container';
import ThemeToggle from './ThemeToggle';

export default function Navigation() {
  return (
    <nav className="border-b border-gray-200 dark:border-gray-800">
      <Container>
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            dkw-blog
          </Link>
          <div className="flex items-center space-x-6">
            <div className="flex space-x-6">
              <Link
                href="/"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                首页
              </Link>
              <Link
                href="/posts"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                文章
              </Link>
              <Link
                href="/tags"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                标签
              </Link>
              <Link
                href="/archive"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                归档
              </Link>
              <Link
                href="/about"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                关于
              </Link>
              <Link
                href="/search"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                搜索
              </Link>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </Container>
    </nav>
  );
}