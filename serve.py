from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys
import os

class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def run(port=8086):
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server_address = ('127.0.0.1', port)
    httpd = ThreadingHTTPServer(server_address, NoCacheHTTPRequestHandler)
    print(f"Server running at http://127.0.0.1:{port}/")
    httpd.serve_forever()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8086
    run(port)
