"""
WARNING: NOT TESTED
"""

import os
import re
import subprocess
from pygls.server import LanguageServer
from lsprotocol.types import (
	CompletionItem,
	CompletionItemKind,
	TextEdit,
	Range,
	Position,
	TEXT_DOCUMENT_SYNC_KIND,
	InitializeResult,
	ServerCapabilities,
	CompletionOptions,
)

server = LanguageServer('lzp-server', 'v0.1')

CAPTURE_SCRIPT = os.environ.get('ZSH_CAPTURE_SCRIPT') or os.path.expanduser(
	'~/projects/lzp/capture.zsh'
)


def get_line_text(doc, line):
	text = doc.source
	lines = text.split('\n')
	return lines[line] if line < len(lines) else ''


def build_arg(full, col):
	col_idx = max(0, col)
	move = max(0, len(full) - col_idx)
	backspaces = '\b' * move if move else ''
	return full + backspaces


def run_capture(arg_sequence):
	res = subprocess.run(
		[CAPTURE_SCRIPT, arg_sequence], capture_output=True, text=True, timeout=3
	)
	if res.returncode != 0:
		raise Exception(res.stderr or f'exit {res.returncode}')
	return res.stdout or ''


def parse_candidates(output):
	candidates = []
	for line in output.split('\n'):
		s = line.strip()
		if not s or s.startswith('ok') or s.startswith('error'):
			continue
		parts = s.split(None, 1)
		label = parts[0]
		detail = s[len(label) :].strip() if len(parts) > 1 else ''
		candidates.append({'label': label, 'detail': detail})
	return candidates


def kind_for_candidate(label, detail):
	if label.endswith('/'):
		return CompletionItemKind.Folder
	if '=' in label or re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*=$', label):
		return CompletionItemKind.Field
	if detail:
		return CompletionItemKind.Function
	return CompletionItemKind.Text


def get_word_start(line_text, col):
	start = col - 1
	while start >= 0 and not line_text[start].isspace():
		start -= 1
	return start + 1


@server.feature('initialize')
def initialize(params):
	return InitializeResult(
		capabilities=ServerCapabilities(
			text_document_sync=TEXT_DOCUMENT_SYNC_KIND.FULL,
			completion_provider=CompletionOptions(resolve_provider=False),
		)
	)


@server.feature('textDocument/completion')
def completion(params):
	doc = server.workspace.get_document(params.text_document.uri)
	if not doc:
		return []

	pos = params.position
	line_text = get_line_text(doc, pos.line)
	arg = build_arg(line_text, pos.character)

	try:
		out = run_capture(arg)
		cand = parse_candidates(out)
		word_start = get_word_start(line_text, pos.character)

		items = []
		for i, c in enumerate(cand):
			items.append(
				CompletionItem(
					label=c['label'],
					kind=kind_for_candidate(c['label'], c['detail']),
					detail=c['detail'] or None,
					sort_text=f'{i:04d}',
					text_edit=TextEdit(
						range=Range(
							start=Position(line=pos.line, character=word_start),
							end=Position(line=pos.line, character=pos.character),
						),
						new_text=c['label'],
					),
				)
			)
		return items
	except Exception as e:
		server.show_message_log(f'capture error: {e}')
		return []


if __name__ == '__main__':
	server.start_io()
