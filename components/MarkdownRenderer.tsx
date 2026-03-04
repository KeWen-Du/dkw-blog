'use client';

import { lazy, Suspense, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkSlug from 'remark-slug';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import Image from 'next/image';

const SyntaxHighlighter = lazy(() => import('react-syntax-highlighter').then(mod => ({ default: mod.Prism })));

interface MarkdownRendererProps {
  content: string;
  url?: string;
}

export default function MarkdownRenderer({ content, url }: MarkdownRendererProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      const textContent = content
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*`_~>|]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      const shareText = url 
        ? `${textContent}\n\n—— 转载自: ${url}`
        : textContent;
      
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  }, [content, url]);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="复制文章内容"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              已复制
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制内容
            </>
          )}
        </button>
      </div>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkSlug, remarkGfm] as any}
        rehypePlugins={[rehypeKatex] as any}
        components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <Suspense fallback={<code className={className} {...props}>{children}</code>}>
              <LazySyntaxHighlighter language={match[1]} className={className}>
                {String(children).replace(/\n$/, '')}
              </LazySyntaxHighlighter>
            </Suspense>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        img({ node, src, alt, ...props }: any) {
          if (!src) return null;
          
          const isExternal = src.startsWith('http://') || src.startsWith('https://');
          
          if (isExternal) {
            return (
              <div className="relative w-full my-4">
                <Image
                  src={src}
                  alt={alt || ''}
                  width={800}
                  height={450}
                  className="rounded-lg"
                  loading="lazy"
                />
              </div>
            );
          }
          
          return (
            <div className="relative w-full my-4">
              <Image
                src={src}
                alt={alt || ''}
                width={800}
                height={450}
                className="rounded-lg"
                loading="lazy"
              />
            </div>
          );
        },
        h1({ node, children, ...props }: any) {
          return (
            <h1 id={props.id} className="text-3xl font-bold mt-8 mb-4 scroll-mt-24" {...props}>
              {children}
            </h1>
          );
        },
        h2({ node, children, ...props }: any) {
          return (
            <h2 id={props.id} className="text-2xl font-semibold mt-6 mb-3 scroll-mt-24" {...props}>
              {children}
            </h2>
          );
        },
        h3({ node, children, ...props }: any) {
          return (
            <h3 id={props.id} className="text-xl font-semibold mt-5 mb-2 scroll-mt-24" {...props}>
              {children}
            </h3>
          );
        },
        h4({ node, children, ...props }: any) {
          return (
            <h4 id={props.id} className="text-lg font-semibold mt-4 mb-2 scroll-mt-24" {...props}>
              {children}
            </h4>
          );
        },
        h5({ node, children, ...props }: any) {
          return (
            <h5 id={props.id} className="text-base font-semibold mt-3 mb-2 scroll-mt-24" {...props}>
              {children}
            </h5>
          );
        },
        h6({ node, children, ...props }: any) {
          return (
            <h6 id={props.id} className="text-sm font-semibold mt-3 mb-2 scroll-mt-24" {...props}>
              {children}
            </h6>
          );
        },
        p({ node, children, ...props }: any) {
          return (
            <p className="my-4 leading-7" {...props}>
              {children}
            </p>
          );
        },
        ul({ node, children, ...props }: any) {
          return (
            <ul className="my-4 ml-6 list-disc" {...props}>
              {children}
            </ul>
          );
        },
        ol({ node, children, ...props }: any) {
          return (
            <ol className="my-4 ml-6 list-decimal" {...props}>
              {children}
            </ol>
          );
        },
        li({ node, children, ...props }: any) {
          return (
            <li className="my-1" {...props}>
              {children}
            </li>
          );
        },
        blockquote({ node, children, ...props }: any) {
          return (
            <blockquote className="border-l-4 border-gray-300 dark:border-gray-700 pl-4 my-4 italic text-gray-600 dark:text-gray-400" {...props}>
              {children}
            </blockquote>
          );
        },
        a({ node, children, href, ...props }: any) {
          return (
            <a
              href={href}
              className="text-blue-600 dark:text-blue-400 hover:underline"
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              {...props}
            >
              {children}
            </a>
          );
        },
        table({ node, children, ...props }: any) {
          return (
            <div className="overflow-x-auto my-6">
              <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700" {...props}>
                {children}
              </table>
            </div>
          );
        },
        thead({ node, children, ...props }: any) {
          return (
            <thead className="bg-gray-100 dark:bg-gray-800" {...props}>
              {children}
            </thead>
          );
        },
        tbody({ node, children, ...props }: any) {
          return <tbody {...props}>{children}</tbody>;
        },
        tr({ node, children, ...props }: any) {
          return (
            <tr className="border-b border-gray-200 dark:border-gray-700" {...props}>
              {children}
            </tr>
          );
        },
        th({ node, children, ...props }: any) {
          return (
            <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 last:border-r-0" {...props}>
              {children}
            </th>
          );
        },
        td({ node, children, ...props }: any) {
          return (
            <td className="px-4 py-2 text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 last:border-r-0" {...props}>
              {children}
            </td>
          );
        },
        hr({ node, ...props }: any) {
          return <hr className="my-8 border-gray-300 dark:border-gray-700" {...props} />;
        },
        del({ node, children, ...props }: any) {
          return <del className="line-through text-gray-500 dark:text-gray-400" {...props}>{children}</del>;
        },
        input({ node, checked, ...props }: any) {
          return (
            <input
              type="checkbox"
              checked={checked}
              disabled
              className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
              {...props}
            />
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </>
  );
}

function LazySyntaxHighlighter({ language, className, children }: { language: string; className: string; children: string }) {
  return (
    <SyntaxHighlighter
      style={require('react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus').default}
      language={language}
      PreTag="div"
      customStyle={{
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
      }}
    >
      {children}
    </SyntaxHighlighter>
  );
}