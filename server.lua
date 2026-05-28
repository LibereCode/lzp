#!/usr/bin/env lua
-- server.lua -- pure Lua, no external deps

-- tiny JSON encode/decode (public-domain rxi-style)
local json = (function()
    local decode
    do
        local pos, s
        local function skip_ws()
            pos = s:find("%S", pos) or (#s + 1)
        end
        local function peek()
            return s:sub(pos, pos)
        end
        local function consume(ch)
            if s:sub(pos, #ch + pos - 1) == ch then
                pos = pos + #ch
                return true
            end
        end
        local function parse_string()
            local i = pos + 1
            local res = {}
            while true do
                local c = s:sub(i, i)
                if c == '"' then
                    local out = table.concat(res)
                    pos = i + 1
                    return out
                elseif c == "\\" then
                    local esc = s:sub(i + 1, i + 1)
                    if esc == "u" then
                        local hex = s:sub(i + 2, i + 5)
                        res[#res + 1] = utf8.char(tonumber(hex, 16))
                        i = i + 6
                    else
                        local map = {
                            ['"'] = '"',
                            ["\\"] = "\\",
                            ["/"] = "/",
                            b = "\b",
                            f = "\f",
                            n = "\n",
                            r = "\r",
                            t = "\t",
                        }
                        res[#res + 1] = map[esc] or esc
                        i = i + 2
                    end
                else
                    res[#res + 1] = c
                    i = i + 1
                end
                if i > #s then
                    error("unterminated string")
                end
            end
        end
        local function parse_number()
            local b, e = s:find("^-?%d+%.?%d*[eE]?[+-]?%d*", pos)
            if not b then
                error("invalid number at " .. pos)
            end
            local num = tonumber(s:sub(b, e))
            pos = e + 1
            return num
        end
        local function parse_value()
            skip_ws()
            local c = peek()
            if c == '"' then
                pos = pos + 1
                return parse_string()
            end
            if c == "{" then
                pos = pos + 1
                local obj = {}
                skip_ws()
                if peek() == "}" then
                    pos = pos + 1
                    return obj
                end
                while true do
                    skip_ws()
                    if peek() ~= '"' then
                        error("expected string key")
                    end
                    pos = pos + 1
                    local k = parse_string()
                    skip_ws()
                    if not consume(":") then
                        error("expected :")
                    end
                    obj[k] = parse_value()
                    skip_ws()
                    if consume("}") then
                        break
                    end
                    if not consume(",") then
                        error("expected ,")
                    end
                end
                return obj
            end
            if c == "[" then
                pos = pos + 1
                local arr = {}
                skip_ws()
                if peek() == "]" then
                    pos = pos + 1
                    return arr
                end
                while true do
                    arr[#arr + 1] = parse_value()
                    skip_ws()
                    if consume("]") then
                        break
                    end
                    if not consume(",") then
                        error("expected ,")
                    end
                end
                return arr
            end
            if s:sub(pos, pos + 3) == "true" then
                pos = pos + 4
                return true
            end
            if s:sub(pos, pos + 4) == "false" then
                pos = pos + 5
                return false
            end
            if s:sub(pos, pos + 3) == "null" then
                pos = pos + 4
                return nil
            end
            return parse_number()
        end
        function decode(str)
            s = str
            pos = 1
            local v = parse_value()
            return v
        end
    end

    local function encode_value(val)
        local t = type(val)
        if t == "nil" then
            return "null"
        end
        if t == "boolean" then
            return val and "true" or "false"
        end
        if t == "number" then
            return tostring(val)
        end
        if t == "string" then
            return '"'
                .. val:gsub('[%z\1-\31\\"]', function(c)
                    return string.format("\\u%04x", c:byte())
                end)
                .. '"'
        end
        if t == "table" then
            local is_array = true
            local max = 0
            for k in pairs(val) do
                if type(k) ~= "number" then
                    is_array = false
                    break
                end
                if k > max then
                    max = k
                end
            end
            if is_array and max > 0 then
                local parts = {}
                for i = 1, max do
                    parts[#parts + 1] = encode_value(val[i])
                end
                return "[" .. table.concat(parts, ",") .. "]"
            else
                local parts = {}
                for k, v in pairs(val) do
                    parts[#parts + 1] = encode_value(k) .. ":" .. encode_value(v)
                end
                return "{" .. table.concat(parts, ",") .. "}"
            end
        end
        error("unsupported type: " .. t)
    end

    return { encode = encode_value, decode = decode }
end)()

-- LSP framed stdio helpers
local function read_message()
    local headers = {}
    while true do
        local line = io.read("*l")
        if not line then
            return nil
        end
        if line == "" then
            break
        end
        local k, v = line:match("^(%S+):%s*(.+)$")
        if k and v then
            headers[k:lower()] = v
        end
    end
    local len = tonumber(headers["content-length"])
    if not len then
        return nil
    end
    local body = io.read(len)
    return body
end

local function send_message(obj)
    local s = json.encode(obj)
    io.write("Content-Length: " .. tostring(#s) .. "\r\n\r\n")
    io.write(s)
    io.flush()
end

-- CompletionItemKind mapping
local CompletionItemKind = {
    Text = 1,
    Method = 2,
    Function = 3,
    Constructor = 4,
    Field = 5,
    Variable = 6,
    Class = 7,
    Interface = 8,
    Module = 9,
    Property = 10,
    Unit = 11,
    Value = 12,
    Enum = 13,
    Keyword = 14,
    Snippet = 15,
    Color = 16,
    File = 17,
    Reference = 18,
    Folder = 19,
    EnumMember = 20,
    Constant = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}

-- capture script path
local CAPTURE_SCRIPT = os.getenv("ZSH_CAPTURE_SCRIPT") or (os.getenv("HOME") .. "/projects/lzp/lzp")

-- helpers
local function trim(s)
    return s:match("^%s*(.-)%s*$")
end

local function get_line_text(text, line)
    local i = 0
    for l in text:gmatch("([^\r\n]*)\r?\n?") do
        i = i + 1
        if i - 1 == line then
            return l
        end
        if l == "" and i > 1 and text:sub(-1) ~= "\n" then
            break
        end
    end
    return ""
end

local function build_arg(full, col)
    local colIdx = math.max(0, col)
    local move = math.max(0, #full - colIdx)
    if move <= 0 then
        return full
    end
    return full .. string.rep("\b", move)
end

local function run_capture(argSequence)
    local cmd = string.format("%q %q", CAPTURE_SCRIPT, argSequence)
    local fh = io.popen(cmd, "r")
    if not fh then
        error("failed to spawn capture script")
    end
    local out = fh:read("*a")
    local ok, _, code = fh:close()
    if not ok and code ~= 0 then
        error("capture exit " .. tostring(code))
    end
    return out or ""
end

local function parseCandidates(output)
    local res = {}
    for line in output:gmatch("([^\r\n]+)") do
        local s = trim(line)
        if s ~= "" and not s:match("^ok") and not s:match("^error") then
            local label, rest = s:match("^(%S+)%s*(.*)$")
            rest = rest or ""
            res[#res + 1] = { label = label, detail = rest }
        end
    end
    return res
end

local function kindForCandidate(label, detail)
    if label:sub(-1) == "/" then
        return CompletionItemKind.Folder
    end
    if label:find("=") or label:match("^[%a_][%w_]*=$") then
        return CompletionItemKind.Field
    end
    if detail and #detail > 0 then
        return CompletionItemKind.Function
    end
    return CompletionItemKind.Text
end

-- minimal document store
local docs = {}

-- handlers
local function handle_initialize(id)
    local res = {
        capabilities = {
            textDocumentSync = 2,
            completionProvider = { resolveProvider = false },
        },
    }
    send_message({ jsonrpc = "2.0", id = id, result = res })
end

local function handle_didOpen(params)
    local td = params.textDocument
    docs[td.uri] = { text = td.text, version = td.version }
end

local function handle_didChange(params)
    local td = params.textDocument
    local doc = docs[td.uri]
    if doc and params.contentChanges and params.contentChanges[1] then
        doc.text = params.contentChanges[1].text
        doc.version = td.version
    end
end

local function handle_completion(id, params)
    local uri = params.textDocument.uri
    local doc = docs[uri]
    if not doc then
        send_message({ jsonrpc = "2.0", id = id, result = {} })
        return
    end
    local pos = params.position
    local lineText = get_line_text(doc.text, pos.line)
    local arg = build_arg(lineText, pos.character)
    local ok, out = pcall(run_capture, arg)
    if not ok then
        send_message({
            jsonrpc = "2.0",
            method = "window/logMessage",
            params = { type = 1, message = "capture error: " .. tostring(out) },
        })
        send_message({ jsonrpc = "2.0", id = id, result = {} })
        return
    end
    local cand = parseCandidates(out)
    local items = {}
    for i, c in ipairs(cand) do
        items[#items + 1] = {
            label = c.label,
            kind = kindForCandidate(c.label, c.detail),
            detail = (#c.detail > 0) and c.detail or nil,
            sortText = string.format("%04d", i - 1),
        }
    end
    send_message({ jsonrpc = "2.0", id = id, result = items })
end

-- main loop
while true do
    local body = read_message()
    if not body then
        break
    end
    local ok, obj = pcall(json.decode, body)
    if not ok or not obj then
        send_message({ jsonrpc = "2.0", method = "window/logMessage", params = { type = 1, message = "invalid json" } })
    else
        local m = obj.method
        if obj.id and m == "initialize" then
            handle_initialize(obj.id)
        elseif m == "initialized" then -- noop
        elseif m == "textDocument/didOpen" then
            handle_didOpen(obj.params)
        elseif m == "textDocument/didChange" then
            handle_didChange(obj.params)
        elseif obj.id and m == "textDocument/completion" then
            handle_completion(obj.id, obj.params)
        elseif m == "shutdown" then
            send_message({ jsonrpc = "2.0", id = obj.id, result = nil })
        elseif m == "exit" then
            os.exit(0)
        end
    end
end
