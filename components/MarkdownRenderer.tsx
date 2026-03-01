'use client';

import { lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkSlug from 'remark-slug';
import rehypeKatex from 'rehype-katex';
import Image from 'next/image';

const SyntaxHighlighter = lazy(() => import('react-syntax-highlighter').then(mod => ({ default: mod.Prism })));

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkSlug]}
      rehypePlugins={[rehypeKatex]}
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
      }}
    >
      {content}
    </ReactMarkdown>
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