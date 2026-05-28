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

## Licenses

See both [my (UN)LICENSE](./UNLICENSE), and
and [for zsh-capture-completion](./zsh-capture-completion.LICENSE)
