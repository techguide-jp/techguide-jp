import { describe, expect, it } from "vitest";
import {
  issueMarkdownBlocks,
  issueMarkdownInline,
  issueMarkdownTask,
} from "$lib/issueMarkdown";

describe("Issue本文の安全な表示", () => {
  it("HTMLを表示用文字列として保持し、リンクの実行スキームを拒否する", () => {
    expect(issueMarkdownBlocks("<script>alert(1)</script>")[0].lines[0]).toBe(
      "<script>alert(1)</script>",
    );
    expect(
      issueMarkdownInline(
        "[実行](javascript:alert) [外部](https://example.com)",
        "https://github.com/org/repo/issues/1",
      ),
    ).toEqual([
      { kind: "text", text: "[実行](javascript:alert)" },
      { kind: "text", text: " " },
      { kind: "link", text: "外部", href: "https://example.com/" },
    ]);
  });
  it("コード内の見出しや箇条書きを解釈しない", () => {
    expect(
      issueMarkdownBlocks("```md\n## title\n- [x] item\n```\n## 完了条件"),
    ).toEqual([
      { kind: "code", lines: ["## title", "- [x] item"] },
      { kind: "heading", lines: ["完了条件"] },
    ]);
  });
  it("通常の箇条書きと混在してもタスクリストの完了状態を読み取る", () => {
    const [block] = issueMarkdownBlocks(
      "- [ ] 未完了\n- [x] 完了\n- [X] **確認済み**\n- 通常の項目",
    );
    expect(block.kind).toBe("list");
    expect(block.lines.map(issueMarkdownTask)).toEqual([
      { checked: false, text: "未完了" },
      { checked: true, text: "完了" },
      { checked: true, text: "**確認済み**" },
      null,
    ]);
  });
  it("リンクや本文中のチェック記号をタスクリストと誤認しない", () => {
    expect(issueMarkdownTask("[x](https://example.com)")).toBeNull();
    expect(issueMarkdownTask("本文中の [ ] 記号")).toBeNull();
    expect(issueMarkdownTask("[ ]直後に空白がない記号")).toBeNull();
  });
});
