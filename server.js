// node server.js
const { createConnection, ProposedFeatures, TextDocuments, CompletionItemKind } = require('vscode-languageserver/node');
const { spawnSync } = require('child_process');
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments();

const COMPLETION_SCRIPT = process.env.ZSH_COMPLETION_SCRIPT || '/usr/local/bin/completion.zsh'; // path to your script or wrapper

connection.onInitialize(() => ({
	capabilities: {
		textDocumentSync: documents.syncKind,
		completionProvider: { resolveProvider: false }
	}
}));

// get single-line text for a given LSP position.line
function getLineText(doc, line) {
	const text = doc.getText();
	const lines = text.split(/\r?\n/);
	return lines[line] ?? '';
}

// build sequence: full line + (full.length - col) backspaces
function buildArgSequence(full, col) {
	const colIdx = Math.max(0, col);
	const move = Math.max(0, full.length - colIdx);
	const backspaces = move ? Array(move).fill('\b').join('') : '';
	return full + backspaces; // completion.zsh appends the Tab itself
}

function runCompletionScript(argSequence, fullBuffer) {
	// call the completion script with the sequence as single arg; provide full buffer on stdin if needed
	// we keep it simple: pass argSequence as arg0
	const res = spawnSync(COMPLETION_SCRIPT, [argSequence], {
		encoding: 'utf8',
		input: fullBuffer,
		timeout: 2000
	});
	if (res.error) throw res.error;
	if (res.status !== 0) {
		// prefer stdout if any, else stderr
		throw new Error(res.stderr || `exit ${res.status}`);
	}
	return res.stdout || '';
}

function parseCandidates(output) {
	// completion.zsh prints an init "ok" line; then outputs matches.
	// We'll return all non-empty lines that do not start with "ok" or "error".
	return output.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('ok') && !s.startsWith('error'));
}

connection.onCompletion((params) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) return [];
	const pos = params.position;
	const lineText = getLineText(doc, pos.line);
	const argSeq = buildArgSequence(lineText, pos.character);
	try {
		const out = runCompletionScript(argSeq, doc.getText());
		const candidates = parseCandidates(out);
		return candidates.map((c, i) => ({
			label: c,
			kind: CompletionItemKind.Text,
			sortText: ('000' + i).slice(-4)
		}));
	} catch (e) {
		connection.console.error('completion error: ' + e.message);
		return [];
	}
});

documents.listen(connection);
connection.listen();
