import Link from 'next/link';
import Container from './Container';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-auto">
      <Container>
        <div className="py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-600 dark:text-gray-400">
              &copy; {new Date().getFullYear()} dkw-blog. All rights reserved.
            </p>
            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
              <Link href="/rss" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                RSS 订阅
              </Link>
              <a
                href="https://github.com/KeWen-Du/dkw-blog"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}