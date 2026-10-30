import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Model and tool output is untrusted. Raw HTML is not rendered, images are dropped so
 * a reply cannot make the tablet call an outside URL, and links stay plain text
 * because a kiosk has no way back from another page.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={['img']}
        components={{ a: ({ children }) => <span className="markdown-link">{children}</span> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
