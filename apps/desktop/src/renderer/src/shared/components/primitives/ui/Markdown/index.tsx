import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import styles from './index.module.css'

const REMARK_PLUGINS = [remarkGfm]

// 창 안에서 이동하지 않도록 새 창으로 보내면 main의 setWindowOpenHandler가 https만 브라우저로 연다
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

interface MarkdownProps {
  text: string
}

/** 마크다운 본문을 React 요소로 그린다. 생 HTML은 버린다 (references/features/ui.md "대화") */
export default function Markdown({ text }: MarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
