/**
 * UI contract: only structured blocks from tools / server — never raw HTML from the model.
 * @param {Array<{ type: string; content?: string; title?: string; body?: string; columns?: string[]; rows?: string[][]; skeleton?: boolean }>} blocks
 */
export function renderUI(blocks) {
  if (!Array.isArray(blocks)) {
    return null;
  }

  return blocks.map((block, i) => {
    if (!block || typeof block !== "object") {
      return null;
    }

    switch (block.type) {
      case "text":
        return (
          <p key={i} className="muted">
            {block.content}
          </p>
        );
      case "card":
        return (
          <article key={i} className={`card${block.skeleton ? " skeleton" : ""}`}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{block.title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {block.body}
            </p>
          </article>
        );
      case "table":
        return (
          <div key={i} className="table-wrap">
            <table>
              <thead>
                <tr>
                  {(block.columns || []).map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(block.rows || []).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  });
}
