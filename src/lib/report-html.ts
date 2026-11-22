const escapeTitle = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

/** O artigo vem do DOM renderizado por React, nunca de HTML informado no projeto. */
export function createReportHtml(title: string, articleHtml: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeTitle(title)}</title><style>
body{font:14px system-ui;max-width:1100px;margin:40px auto;padding:20px;color:#302d28;background:#fff;line-height:1.6}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:12px}th,td{border:1px solid #ccc;padding:7px;text-align:left;vertical-align:top}
svg{width:100%;height:280px}h1,h2,h3{line-height:1.3}h2{margin-top:32px}section{break-inside:avoid}p,dd,td,code{overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}dl{margin:12px 0}dt{font-weight:600}dd{margin:0 0 8px}
.report-table-wrap{overflow-x:auto}.report-brand{font-size:11px;letter-spacing:1px}.hint{color:#56524b}.no-print{display:none}
@media print{body{max-width:none;margin:0;padding:0;font-size:10pt}.report-table-wrap{overflow:visible}table{font-size:8pt;table-layout:fixed}th,td{padding:4px;overflow-wrap:anywhere}section{break-inside:auto}tr{break-inside:avoid}thead{display:table-header-group}details>summary{font-weight:600}@page{size:A4;margin:16mm}}
@media print{.report-table-wrap table{table-layout:auto;font-size:7.5pt}.report-table-wrap td{padding:3px;white-space:nowrap;overflow-wrap:normal}}
</style></head><body>${articleHtml}</body></html>`;
}
