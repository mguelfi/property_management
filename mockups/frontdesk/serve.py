#!/usr/bin/env python3
"""Static file server for the front-desk mockups. Stdlib only, no dependencies.

Usage: python3 mockups/frontdesk/serve.py
Then open http://<this-machine's-address>:8020/
"""
import http.server
import os

PORT = 8020

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
    }


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving front-desk mockups at http://0.0.0.0:{PORT}/  (open /index.html)")
        httpd.serve_forever()
