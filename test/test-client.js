// node test-client.js
const { spawn } = require('child_process');

const server = spawn('node', ['/home/kashnomo/projects/lzp/server.js'], {
	stdio: ['pipe', 'pipe', 'inherit']
});

function send(obj) {
	const s = JSON.stringify(obj);
	const msg = `Content-Length: ${Buffer.byteLength(s, 'utf8')}\r\n\r\n${s}`;
	server.stdin.write(msg);
}

// read framed responses
let buf = '';
server.stdout.on('data', (chunk) => {
	buf += chunk.toString('utf8');
	while (true) {
		const hdrEnd = buf.indexOf('\r\n\r\n');
		if (hdrEnd === -1) break;
		const hdr = buf.slice(0, hdrEnd);
		const m = hdr.match(/Content-Length: (\d+)/i);
		if (!m) { buf = buf.slice(hdrEnd + 4); continue; }
		const len = parseInt(m[1], 10);
		const start = hdrEnd + 4;
		if (buf.length < start + len) break;
		const body = buf.slice(start, start + len);
		console.log('<<', body);
		buf = buf.slice(start + len);
	}
});

const init = {
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: { processId: process.pid, rootUri: null, capabilities: {} }
};
send(init);

// send initialized notification
send({ jsonrpc: '2.0', method: 'initialized', params: {} });

// send a completion request for a simple zsh file
const docUri = 'file:///tmp/test.zsh';
const open = {
	jsonrpc: '2.0',
	method: 'textDocument/didOpen',
	params: {
		textDocument: {
			uri: docUri, languageId: 'zsh', version: 1,
			text: 'git ch'
		}
	}
};
send(open);

// ask completion at line 0 char 6 (end of "git ch")
const completionReq = {
	jsonrpc: '2.0',
	id: 2,
	method: 'textDocument/completion',
	params: {
		textDocument: { uri: docUri },
		position: { line: 0, character: 6 },
		context: {}
	}
};
setTimeout(() => send(completionReq), 200);

// shutdown after some time
setTimeout(() => {
	send({ jsonrpc: '2.0', id: 3, method: 'shutdown', params: null });
	send({ jsonrpc: '2.0', method: 'exit', params: {} });
	server.stdin.end();
}, 2000);
