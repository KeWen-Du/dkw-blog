'use client';

import { useState } from 'react';

interface ShareButtonsProps {
  title: string;
  url: string;
}

export default function ShareButtons({ title, url }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const shareUrls = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    weibo: `https://service.weibo.com/share/share.php?title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareButtons = [
    {
      name: 'Twitter',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      href: shareUrls.twitter,
      color: 'hover:text-blue-400',
    },
    {
      name: 'Facebook',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      href: shareUrls.facebook,
      color: 'hover:text-blue-600',
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      href: shareUrls.linkedin,
      color: 'hover:text-blue-700',
    },
    {
      name: '微博',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.739 5.443z" />
          <ellipse cx="9.852" cy="16.021" rx="2.375" ry="1.735" />
          <path d="M18.609 11.523c-.227-.06-.37-.09-.37-.09l.06-.291c.289-1.405-.05-2.646-1.07-3.084-1.07-.438-2.46.06-3.16 1.317-.375.688-.521 1.429-.407 2.045l.061.291s-.144.031-.371.09c-2.056.545-3.435 1.783-3.435 1.783s1.521-2.09 4.656-2.09c.5 0 .976.065 1.418.175.322-.769.858-1.43 1.541-1.858.698-.438 1.434-.597 2.043-.495l.061-.291c.114-.616-.032-1.357-.407-2.045-.7-1.257-2.09-1.755-3.16-1.317-1.02.438-1.359 1.679-1.07 3.084l.06.291s-.143.03-.37.09c-2.056.545-3.435 1.783-3.435 1.783s1.521-2.09 4.656-2.09c.5 0 .976.065 1.418.175.322-.769.858-1.43 1.541-1.858.698-.438 1.434-.597 2.043-.495z" />
        </svg>
      ),
      href: shareUrls.weibo,
      color: 'hover:text-red-500',
    },
  ];

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 dark:text-gray-400">分享：</span>
      {shareButtons.map((button) => (
        <a
          key={button.name}
          href={button.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-gray-600 dark:text-gray-400 ${button.color} transition-colors`}
          title={`分享到 ${button.name}`}
        >
          {button.icon}
        </a>
      ))}
      <button
        onClick={handleCopyLink}
        className={`text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors`}
        title={copied ? '已复制' : '复制链接'}
      >
        {copied ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}