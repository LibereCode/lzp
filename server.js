const {
	createConnection, ProposedFeatures, TextDocuments, CompletionItemKind
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');

const connection = createConnection(process.stdin, process.stdout, ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
documents.listen(connection);

const CAPTURE_SCRIPT = process.env.ZSH_CAPTURE_SCRIPT || '/home/kashnomo/projects/lzp/capture.zsh';

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

function parseCandidates(output) {
	return output.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('ok') && !s.startsWith('error'));
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
		return cand.map((c, i) => ({ label: c, kind: CompletionItemKind.Text, sortText: ('000' + i).slice(-4) }));
	} catch (e) {
		connection.console.error('capture error: ' + e.message);
		return [];
	}
});

connection.listen();
