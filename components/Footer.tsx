export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 mt-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="text-center text-gray-600 dark:text-gray-400">
          <p>&copy; {new Date().getFullYear()} dkw-blog. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}