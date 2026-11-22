import { describe, expect, it } from "vitest";
import { createReportHtml } from "../../src/lib/report-html";

describe("HTML portátil de relatórios", () => {
  it("escapa o título sem permitir fechar a tag ou introduzir script", () => {
    const html = createReportHtml(
      '</title><script>alert("x")</script> & projeto',
      "<article><h1>Entrada renderizada</h1></article>",
    );
    expect(html).toContain(
      "&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; projeto",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("<article><h1>Entrada renderizada</h1></article>");
  });

  it("preserva o texto já escapado do DOM em um documento local imprimível", () => {
    const html = createReportHtml(
      "GeoStruct · Resultados",
      "<article><p>&lt;img src=x&gt;</p><p>FS = 0,000</p></article>",
    );
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain("@media print");
    expect(html).toContain("FS = 0,000");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toMatch(/<(?:script|link|iframe)\b/i);
  });
});
