#!/usr/bin/env python3
# Minimal stdio LSP that sends current line to zsh completion engine and returns reply[] as completions.
import sys, os, json, subprocess

docs = {}


def read_msg():
	hdr = b''
	while True:
		line = sys.stdin.buffer.readline()
		if not line:
			return None
		hdr += line
		if hdr.endswith(b'\r\n\r\n'):
			break
	headers = {}
	for l in hdr.decode().split('\r\n'):
		if ':' in l:
			k, v = l.split(':', 1)
			headers[k.strip().lower()] = v.strip()
	length = int(headers.get('content-length', 0))
	body = sys.stdin.buffer.read(length)
	return json.loads(body.decode())


def send(resp):
	b = json.dumps(resp, separators=(',', ':')).encode()
	sys.stdout.buffer.write(
		b'Content-Length: ' + str(len(b)).encode() + b'\r\n\r\n' + b
	)
	sys.stdout.buffer.flush()


def zsh_complete(line, col):
	# col: 0-based character index -> zsh expects 1-based cursor
	cursor = str(col)
	# Build zsh one-liner that sets BUFFER and CURSOR, loads compinit, runs completion, prints reply entries null-separated
	zsh_code = (
		'autoload -Uz compinit 2>/dev/null || true; compinit >/dev/null 2>&1 || true;'
		'BUFFER=${BUFFER};CURSOR=${CURSOR};_main_complete 2>/dev/null || _main_complete || true;'
		'for r in "${reply[@]}"; do printf \'%s\\n\' "$r"; done'
	)
	env = os.environ.copy()
	# Pass BUFFER and CURSOR via env to avoid shell quoting headaches
	env['BUFFER'] = line
	env['CURSOR'] = cursor
	try:
		out = subprocess.check_output(
			['zsh', '-c', zsh_code],
			env=env,
			stderr=subprocess.DEVNULL,
			text=True,
			timeout=1.0,
		)
	except Exception:
		out = ''
	return [l for l in out.splitlines() if l]


def handle_request(req):
	if 'method' not in req:
		return
	m = req['method']
	if m == 'initialize':
		send(
			{
				'jsonrpc': '2.0',
				'id': req.get('id'),
				'result': {
					'capabilities': {'completionProvider': {'resolveProvider': False}}
				},
			}
		)
	elif m == 'textDocument/didOpen':
		doc = req['params']['textDocument']
		docs[doc['uri']] = doc['text']
	elif m == 'textDocument/didChange':
		uri = req['params']['textDocument']['uri']
		# assume full sync
		docs[uri] = req['params']['contentChanges'][0]['text']
	elif m == 'textDocument/completion':
		params = req['params']
		uri = params['textDocument']['uri']
		pos = params['position']
		text = docs.get(uri, '')
		lines = text.splitlines()
		line = lines[pos['line']] if pos['line'] < len(lines) else ''
		items = []
		for s in zsh_complete(line, pos['character']):
			items.append({'label': s, 'kind': 1})
		send({'jsonrpc': '2.0', 'id': req.get('id'), 'result': items})
	elif m == 'shutdown':
		send({'jsonrpc': '2.0', 'id': req.get('id'), 'result': None})
	elif m == 'exit':
		sys.exit(0)


def main():
	while True:
		msg = read_msg()
		if msg is None:
			break
		# handle notifications/requests
		try:
			handle_request(msg)
		except Exception as e:
			# best-effort: respond with error if request had id
			if 'id' in msg:
				send(
					{
						'jsonrpc': '2.0',
						'id': msg.get('id'),
						'error': {'code': -32603, 'message': str(e)},
					}
				)


if __name__ == '__main__':
	main()
