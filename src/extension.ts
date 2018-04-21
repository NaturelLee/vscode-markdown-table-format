'use strict';
import { ExtensionContext, TextDocument, FormattingOptions, CancellationToken, TextEdit, languages, Position, DocumentFormattingEditProvider, window, Range } from 'vscode';
import MarkDownDOM from 'markdown-dom';

export function activate(context: ExtensionContext) {
    const tableFormatter = new TableFormatter();
    languages.registerDocumentFormattingEditProvider('markdown', tableFormatter);
    context.subscriptions.push(tableFormatter);
}

class TableFormatter implements DocumentFormattingEditProvider {
    constructor() {
    }

    // TODO: Preserve the correct line endings.
    provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken) {
        const tables: { lines: string[]; start: Position; end?: Position; }[] = [];
        let table = false;
        for (let index = 0; index < document.lineCount; index++) {
            const line = document.lineAt(index);
            if (line.text.startsWith('|')) {
                if (!table) {
                    tables.push({ lines: [ line.text ], start: line.range.start });
                    table = true;
                } else {
                    tables[tables.length - 1].lines.push(line.text);
                }
            } else {
                if (table) {
                    const currentTable = tables[tables.length - 1];
                    currentTable.end = line.range.start;
                    table = false;
                }
            }
        }

        const edits: TextEdit[] = [];
        for (const table of tables) {
            // TODO: Fix the type!
            const dom: any = MarkDownDOM.parse(table.lines.join('\n'));
            if (dom.blocks.length !== 1 || dom.blocks[0].type !== 'table') {
                // TODO: Report error to telemetry.
                continue;
            }

            const block = dom.blocks[0];
            if (block.body.find((row: string[]) => row.length !== block.header.length)) {
                // TODO: Report possible parsing error to telemetry.
                window.showWarningMessage(`Skipping the table at line ${table.start.line} as it doesn't have matrix shape.`);
                continue;
            }

            if (block.body[0].find((cell: string) => cell.replace(/-/g, '') !== '')) {
                window.showWarningMessage(`Skipping the table at line ${table.start.line} as it doesn't have the dash row.`);
                continue;
            }

            block.body.shift(); // Pop the dash row.

            const columnWidths = block.header.map(() => 0);

            for (let index = 0; index < columnWidths.length; index++) {
                columnWidths[index] = Math.max(columnWidths[index], block.header[index].trim().length);
            }

            for (const row of block.body) {
                for (let index = 0; index < columnWidths.length; index++) {
                    columnWidths[index] = Math.max(columnWidths[index], row[index].trim().length);
                }
            }

            block.header.pop(); // TODO: Fix the extra phantom cell in MarkDownDOM.

            let markdown = '';
            markdown += '|' + block.header.map((cell: string, index: number) => ` ${cell.trim().padEnd(columnWidths[index])} `).join('|') + '|\n';
            markdown += '|' + block.header.map((cell: string, index: number) => '-'.repeat(cell.length).padEnd(columnWidths[index])).join('|') + '|\n';
            for (const row of block.body) {
                row.pop(); // TODO: Fix the extra phantom cell in MarkDownDOM.
                markdown += '|' + row.map((cell: string, index: number) => ` ${cell.trim().padEnd(columnWidths[index])} `).join('|') + '|\n';
            }

            edits.push(TextEdit.replace(new Range(table.start, table.end!), markdown));
        }

        return edits;
    }

    dispose() {
    }
}
