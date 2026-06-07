#!/usr/bin/env python3
import json
import sys
import subprocess

LOG_FILE = '/tmp/lzp.log'
captureScriptPath = '~/projects/lzp2/capture.zsh'

raw_input = (
	'Content-Length: 256 Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n'
	'\r\n{"jsonrpc":"2.0","id":17,"method":"textDocument/completion"}'
)


def send_response(request_id, result):
	body = json.dumps({'jsonrpc': '2.0', 'id': request_id, 'result': result})
	header = f'Content-Length: {len(body)}\r\n\r\n'
	f.write(header + body)
	sys.stdout.write(header + body)
	sys.stdout.flush()


with open('/tmp/lzp.log', 'a') as f:
	while True:
		try:
			line = sys.stdin.readline()
			if not line:
				break
			if line[0] != '{':
				if line.strip() == '':
					continue
				else:
					f.write('header: ' + str(line))

			body = json.loads(line)
			f.write('body: ' + str(body) + '\n')
			if body['method'] == 'initialize':
				send_response(
					body['id'],
					{'capabilities': {'completionProvider': {}, 'textDocumentSync': 1}},
				)
			elif body['method'] == 'textDocument/completion':
				send_response(body['id'], {'items': [{'label': 'test'}]})

		except (IndexError, json.JSONDecodeError):
			continue
