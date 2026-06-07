// WARN: NOT TESTED
package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"github.com/tliron/glsp"
	"github.com/tliron/glsp/protocol"
	"github.com/tliron/glsp/server"
)

var (
	captureScript string
	handler       *glsp.Handler
)

func init() {
	captureScript = os.Getenv("ZSH_CAPTURE_SCRIPT")
	if captureScript == "" {
		home, _ := os.UserHomeDir()
		captureScript = filepath.Join(home, "projects/lzp/capture.zsh")
	}
}

func getLineText(doc *protocol.TextDocument, line int) string {
	lines := strings.Split(doc.Text, "\n")
	if line < len(lines) {
		return lines[line]
	}
	return ""
}

func buildArg(full string, col int) string {
	if col < 0 {
		col = 0
	}
	move := len(full) - col
	if move < 0 {
		move = 0
	}
	return full + strings.Repeat("\b", move)
}

func runCapture(argSeq string) (string, error) {
	cmd := exec.Command(captureScript, argSeq)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

type Candidate struct {
	Label  string
	Detail string
}

func parseCandidates(output string) []Candidate {
	var candidates []Candidate
	for _, line := range strings.Split(output, "\n") {
		s := strings.TrimSpace(line)
		if s == "" || strings.HasPrefix(s, "ok") || strings.HasPrefix(s, "error") {
			continue
		}
		parts := strings.SplitN(s, " ", 2)
		label := parts[0]
		detail := ""
		if len(parts) > 1 {
			detail = strings.TrimSpace(parts[1])
		}
		candidates = append(candidates, Candidate{label, detail})
	}
	return candidates
}

func kindForCandidate(label, detail string) protocol.CompletionItemKind {
	if strings.HasSuffix(label, "/") {
		return protocol.CompletionItemKindFolder
	}
	if strings.Contains(label, "=") || regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*=$`).MatchString(label) {
		return protocol.CompletionItemKindField
	}
	if detail != "" {
		return protocol.CompletionItemKindFunction
	}
	return protocol.CompletionItemKindText
}

func getWordStart(lineText string, col int) int {
	start := col - 1
	for start >= 0 && !unicode.IsSpace(rune(lineText[start])) {
		start--
	}
	return start + 1
}

func onInitialize(ctx context.Context, reply *server.ReplyHandler, req *protocol.InitializeRequest) error {
	return reply.Reply(ctx, &protocol.InitializeResult{
		Capabilities: protocol.ServerCapabilities{
			TextDocumentSyncOptions: protocol.TextDocumentSyncOptions{
				Change: protocol.TextDocumentSyncKindFull,
			},
			CompletionProvider: &protocol.CompletionOptions{
				ResolveProvider: false,
			},
		},
	})
}

func onCompletion(ctx context.Context, reply *server.ReplyHandler, req *protocol.CompletionParams) error {
	doc, ok := handler.Documents[req.TextDocument.URI]
	if !ok {
		return reply.Reply(ctx, []protocol.CompletionItem{})
	}

	lineText := getLineText(doc, int(req.Position.Line))
	arg := buildArg(lineText, int(req.Position.Character))

	out, err := runCapture(arg)
	if err != nil {
		return reply.Reply(ctx, []protocol.CompletionItem{})
	}

	cand := parseCandidates(out)
	wordStart := getWordStart(lineText, int(req.Position.Character))

	items := make([]protocol.CompletionItem, len(cand))
	for i, c := range cand {
		items[i] = protocol.CompletionItem{
			Label:    c.Label,
			Kind:     kindForCandidate(c.Label, c.Detail),
			Detail:   c.Detail,
			SortText: fmt.Sprintf("%04d", i),
			TextEdit: &protocol.TextEdit{
				Range: protocol.Range{
					Start: protocol.Position{Line: req.Position.Line, Character: uint32(wordStart)},
					End:   req.Position,
				},
				NewText: c.Label,
			},
		}
	}

	return reply.Reply(ctx, items)
}

func main() {
	handler = glsp.NewHandler()
	handler.AddInitializeFunc(onInitialize)
	handler.AddHandlerFunc(protocol.MethodTextDocumentCompletion, onCompletion)

	server := server.NewServer(handler, false)
	server.Run()
}
