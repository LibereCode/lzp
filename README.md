# lzp

## USAGE

```zsh
mkdir ~/projects
git clone https://github.com/LibereCode/lzp.git ~/projects/lzp
```

(OPTIONAL) Set envvar:

- `LZP_PROJECT_DIR` (path),
    _default_ = "~/projects/lzp"
- `LZP_CAPTURE_SCRIPT` (path),
    _default_ = ~/projects/lzp/capture.zsh
- `LZP_NODE_SERVER` (path),
    _default_ = `${LZP_PROJECT_DIR}`/server.js

```lua ~/.config/nvim/lsp/lzp.lua
-- ~/.config/nvim/lsp/lzp.lua
return {
  cmd = { 'lzp' },
  filetypes = { 'zsh' },
  root_markers = { '.git', '.zshrc' },
}
```

```lua init.lua
-- ~/.config/nvim/lsp/lzp.lua
vim.lsp.enable('lzp')
```

Then it works??

## Credits

- [zsh-capture-completion](https://github.com/Valodim/zsh-capture-completion)
  for writing `./capture.zsh`

## Licenses

See both [my (UN)LICENSE](./UNLICENSE), and
and [for zsh-capture-completion](./zsh-capture-completion.LICENSE)

## AI-disclaimer

Until I learn how to code J🤢vaScr🤮pt  and rewrite it all,
I have to admit that most of the server.js was written by <https://duck.ai>.

I have done most of the shell-script except `./capture.zsh`
