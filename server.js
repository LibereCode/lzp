const {
	createConnection, ProposedFeatures, TextDocuments, CompletionItemKind
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');

const connection = createConnection(process.stdin, process.stdout, ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
documents.listen(connection);

const CAPTURE_SCRIPT = process.env.ZSH_CAPTURE_SCRIPT || (process.env.HOME + '/projects/lzp/capture.zsh');

connection.onInitialize(() => ({
	capabilities: {
		textDocumentSync: documents.syncKind,
		completionProvider: { resolveProvider: false }
	}
}));

function getLineText(doc, line) {
	const text = doc.getText();
	const lines = text.split(/\r?\n/);
	return lines[line] || '';
}

function buildArg(full, col) {
	const colIdx = Math.max(0, col);
	const move = Math.max(0, full.length - colIdx);
	const backspaces = move ? Array(move).fill('\b').join('') : '';
	return full + backspaces;
}

function runCapture(argSequence) {
	const { spawnSync } = require('child_process');
	const res = spawnSync(CAPTURE_SCRIPT, [argSequence], { encoding: 'utf8', timeout: 3000 });
	if (res.error) throw res.error;
	if (res.status !== 0) throw new Error(res.stderr || `exit ${res.status}`);
	return res.stdout || '';
}

// function parseCandidates(output) {
// 	return output.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('ok') && !s.startsWith('error'));
// }

function parseCandidates(output) { // TEST:
	return output
		.split(/\r?\n/)
		.map(s => s.trim())
		.filter(s => s && !s.startsWith('ok') && !s.startsWith('error'))
		.map(s => {
			const parts = s.split(/\s+/, 2); // first word, rest
			const label = parts[0];
			const detail = s.slice(label.length).trim(); // preserve everything after first word
			return { label, detail };
		});
}
function kindForCandidate(label, detail) {
	if (label.endsWith('/')) return CompletionItemKind.Folder;
	if (label.includes('=') || /^[a-zA-Z_][a-zA-Z0-9_]*=$/.test(label)) return CompletionItemKind.Field;
	if (detail) return CompletionItemKind.Function;
	return CompletionItemKind.Text;
}

connection.onCompletion((params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const pos = params.position;
	const lineText = getLineText(doc, pos.line);
	const arg = buildArg(lineText, pos.character);
	try {
		const out = runCapture(arg);
		const cand = parseCandidates(out);
		// return cand.map((c, i) => ({ label: c, kind: CompletionItemKind.Text, sortText: ('000' + i).slice(-4) }));
		return cand.map((c, i) => ({ // TEST:
			label: c.label,
			kind: kindForCandidate(c.label, c.detail),
			detail: c.detail || undefined,
			sortText: ('000' + i).slice(-4)
		}));
	} catch (e) {
		connection.console.error('capture error: ' + e.message);
		return [];
	}
});

connection.listen();
