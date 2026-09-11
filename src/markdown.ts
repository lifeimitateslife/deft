import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import type { Document } from "./types";
let renderer: InstanceType<typeof MarkdownIt> | undefined;
export async function renderMarkdown(text: string, doc?: Document) {
  if (!renderer) {
    const [{ default: texmath }, { default: katex }, { default: tasks }] =
      await Promise.all([
        import("markdown-it-texmath"),
        import("katex"),
        import("markdown-it-task-lists"),
      ]);
    renderer = new MarkdownIt({ html: false, linkify: false, breaks: false })
      .use(tasks)
      .use(texmath, {
        engine: katex,
        delimiters: "dollars",
        katexOptions: {
          trust: false,
          strict: "ignore",
          throwOnError: false,
          output: "mathml",
        },
      });
  }
  const template = document.createElement("template");
  template.innerHTML = DOMPurify.sanitize(renderer.render(text), {
    ADD_TAGS: ["annotation", "semantics"],
    ADD_ATTR: ["encoding"],
  });
  await Promise.all(
    [...template.content.querySelectorAll("img")].map(async (img) => {
      const src = img.getAttribute("src") || "";
      img.removeAttribute("src");
      if (doc?.path && !/^[a-z]+:|^[/\\]/i.test(src)) {
        try {
          img.src = await window.deft.asset(doc.id, src);
        } catch {
          img.alt = `${img.alt} (local image unavailable)`;
        }
      } else img.alt = `${img.alt} (remote images blocked)`;
    }),
  );
  for (const link of template.content.querySelectorAll("a")) {
    const href = link.getAttribute("href") || "";
    if (/^(?!https?:)[a-z][a-z\d+.-]*:/i.test(href))
      link.removeAttribute("href");
  }
  return template.innerHTML;
}
export async function exportDocument(doc: Document) {
  const body =
    doc.kind === "markdown" || doc.formatted
      ? await renderMarkdown(doc.text, doc)
      : `<pre>${doc.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>DEFT document</title><style>body{font:17px/1.65 system-ui;max-width:780px;margin:48px auto;color:#20242b;padding:0 24px}pre,code{font-family:monospace;white-space:pre-wrap}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px 12px}blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:20px}@media print{body{margin:0;max-width:none}}</style></head><body>${body}</body></html>`;
}
