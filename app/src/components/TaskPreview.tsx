import type { ReactNode } from "react";

/** 行内 Markdown：**加粗** 与 `代码` */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={key++}>{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 列表卡片的两行预览：按行渲染轻量 Markdown（## 标题 / - 圆点 / 加粗 / 代码）。 */
export function TaskPreview({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="preview">
      {lines.map((line, i) => {
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
          return (
            <span key={i} className={`md-h md-h${heading[1].length}`}>
              {renderInline(heading[2])}
            </span>
          );
        }
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <span key={i} className="md-line">
              {"• "}
              {renderInline(bullet[1])}
            </span>
          );
        }
        return (
          <span key={i} className="md-line">
            {renderInline(line)}
          </span>
        );
      })}
    </div>
  );
}
