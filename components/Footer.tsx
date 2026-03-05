import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-[var(--muted)]">
            {new Date().getFullYear()} dkw-blog
          </p>
          <div className="flex items-center gap-6">
            <Link 
              href="/rss" 
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              RSS
            </Link>
            <a
              href="https://github.com/KeWen-Du/dkw-blog"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
