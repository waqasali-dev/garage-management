import React from 'react';

/**
 * Robust, lightweight Markdown Parser & Formatter Component
 * Formats headings, tables, bold, italics, lists, inline code, and codeblocks cleanly.
 */
export default function MarkdownRenderer({ content = '' }) {
    if (!content) return null;

    const renderFormattedText = (text) => {
        if (!text) return '';

        // Bold & Italic replacements
        let formatted = text
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

        return formatted;
    };

    const lines = content.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockLines = [];
    let inTable = false;
    let tableHeaders = [];
    let tableRows = [];
    let inList = false;
    let listItems = [];
    let isOrderedList = false;

    const flushCodeBlock = (key) => {
        if (codeBlockLines.length > 0) {
            elements.push(
                <div key={key} className="md-code-block-wrap">
                    {codeBlockLang && <div className="md-code-lang-tag">{codeBlockLang}</div>}
                    <pre className="md-code-pre">
                        <code>{codeBlockLines.join('\n')}</code>
                    </pre>
                </div>
            );
            codeBlockLines = [];
            codeBlockLang = '';
        }
        inCodeBlock = false;
    };

    const flushTable = (key) => {
        if (tableHeaders.length > 0 || tableRows.length > 0) {
            elements.push(
                <div key={key} className="md-table-container">
                    <table className="md-table">
                        {tableHeaders.length > 0 && (
                            <thead>
                                <tr>
                                    {tableHeaders.map((th, i) => (
                                        <th key={i} dangerouslySetInnerHTML={{ __html: renderFormattedText(th.trim()) }} />
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {tableRows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                    {row.map((cell, cIdx) => (
                                        <td key={cIdx} dangerouslySetInnerHTML={{ __html: renderFormattedText(cell.trim()) }} />
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableHeaders = [];
            tableRows = [];
        }
        inTable = false;
    };

    const flushList = (key) => {
        if (listItems.length > 0) {
            if (isOrderedList) {
                elements.push(
                    <ol key={key} className="md-ordered-list">
                        {listItems.map((li, i) => (
                            <li key={i} dangerouslySetInnerHTML={{ __html: renderFormattedText(li) }} />
                        ))}
                    </ol>
                );
            } else {
                elements.push(
                    <ul key={key} className="md-unordered-list">
                        {listItems.map((li, i) => (
                            <li key={i} dangerouslySetInnerHTML={{ __html: renderFormattedText(li) }} />
                        ))}
                    </ul>
                );
            }
            listItems = [];
        }
        inList = false;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 1. Code block handling
        if (trimmed.startsWith('```')) {
            if (inCodeBlock) {
                flushCodeBlock(`code_${i}`);
            } else {
                if (inTable) flushTable(`table_${i}`);
                if (inList) flushList(`list_${i}`);
                inCodeBlock = true;
                codeBlockLang = trimmed.replace('```', '').trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // 2. Table handling
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (inList) flushList(`list_${i}`);

            const cells = trimmed
                .split('|')
                .slice(1, -1)
                .map((c) => c.trim());

            // Check if separator line (e.g. |---|---|)
            const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
            if (isSeparator) {
                // Ignore markdown alignment row
                continue;
            }

            if (!inTable) {
                inTable = true;
                tableHeaders = cells;
            } else {
                tableRows.push(cells);
            }
            continue;
        } else if (inTable) {
            flushTable(`table_${i}`);
        }

        // 3. List handling
        const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)/);
        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);

        if (unorderedMatch) {
            if (inList && isOrderedList) flushList(`list_${i}`);
            inList = true;
            isOrderedList = false;
            listItems.push(unorderedMatch[1]);
            continue;
        } else if (orderedMatch) {
            if (inList && !isOrderedList) flushList(`list_${i}`);
            inList = true;
            isOrderedList = true;
            listItems.push(orderedMatch[2]);
            continue;
        } else if (inList && trimmed === '') {
            // Empty line might separate list
            flushList(`list_${i}`);
        } else if (inList) {
            flushList(`list_${i}`);
        }

        // 4. Headings
        if (trimmed.startsWith('### ')) {
            elements.push(
                <h3 key={`h3_${i}`} className="md-heading-3" dangerouslySetInnerHTML={{ __html: renderFormattedText(trimmed.replace('### ', '')) }} />
            );
            continue;
        }
        if (trimmed.startsWith('## ')) {
            elements.push(
                <h2 key={`h2_${i}`} className="md-heading-2" dangerouslySetInnerHTML={{ __html: renderFormattedText(trimmed.replace('## ', '')) }} />
            );
            continue;
        }
        if (trimmed.startsWith('# ')) {
            elements.push(
                <h1 key={`h1_${i}`} className="md-heading-1" dangerouslySetInnerHTML={{ __html: renderFormattedText(trimmed.replace('# ', '')) }} />
            );
            continue;
        }

        // 5. Horizontal Rule
        if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
            elements.push(<hr key={`hr_${i}`} className="md-hr" />);
            continue;
        }

        // 6. Blockquote / Alerts
        if (trimmed.startsWith('> ')) {
            elements.push(
                <blockquote key={`quote_${i}`} className="md-blockquote" dangerouslySetInnerHTML={{ __html: renderFormattedText(trimmed.replace(/^>\s*/, '')) }} />
            );
            continue;
        }

        // 7. Regular paragraph
        if (trimmed !== '') {
            elements.push(
                <p key={`p_${i}`} className="md-paragraph" dangerouslySetInnerHTML={{ __html: renderFormattedText(trimmed) }} />
            );
        }
    }

    // Flush any pending blocks
    if (inCodeBlock) flushCodeBlock('code_end');
    if (inTable) flushTable('table_end');
    if (inList) flushList('list_end');

    return <div className="markdown-rendered-body">{elements}</div>;
}
