#!/usr/bin/env bash
# Renders the HTML documents in docs/ to PDFs in out/, using headless Chrome so
# the SVG diagrams and web fonts come out exactly as they look in a browser.
#
#   ./scripts/build-docs-pdf.sh
#
# The local server is not incidental: `python3 -m http.server` sends text/html
# with no charset, Chrome then decodes UTF-8 as latin-1, and every em-dash in
# the PDF turns to mojibake. This one sets the charset.
set -euo pipefail

cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8899

[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME"; exit 1; }
mkdir -p out

python3 - "$PORT" <<'PY' &
import functools, http.server, socketserver, sys
class H(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        t = super().guess_type(path)
        return t + "; charset=utf-8" if t in ("text/html", "text/css") else t
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", int(sys.argv[1])),
        functools.partial(H, directory="docs")) as s:
    s.serve_forever()
PY
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1.5

render () {
  echo "  $2.pdf"
  "$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
    --virtual-time-budget=15000 \
    --print-to-pdf="out/$2.pdf" "http://127.0.0.1:$PORT/$1.html" 2>/dev/null
}

echo "Rendering:"
render system-map "BDMF System Map"
render decisions  "BDMF Decisions"
echo "Done — see out/"
