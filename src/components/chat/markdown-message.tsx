'use client';

import { memo, type ComponentPropsWithoutRef } from 'react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeSanitize];

function Code({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const isBlock = Boolean(className?.includes('language-') || code.includes('\n'));

  if (!isBlock) {
    return (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    );
  }

  return (
    <span className="bg-muted relative my-3 block overflow-hidden rounded-md border">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className="absolute top-2 right-2"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy code"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <code
        className={cn('block overflow-x-auto p-3 pr-10 font-mono text-xs leading-relaxed', className)}
        {...props}
      >
        {children}
      </code>
    </span>
  );
}

export const MarkdownMessage = memo(function MarkdownMessage({
  children,
}: {
  children: string;
}) {
  return (
    <div className="space-y-3 break-words select-text [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:whitespace-pre-wrap [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
        components={{
          code: Code,
          a: ({ children: linkChildren, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer noopener"
              className="text-phosphor underline underline-offset-2"
            >
              {linkChildren}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
