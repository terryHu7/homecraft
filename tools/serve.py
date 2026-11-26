# Local server for the site: `python3 -m http.server` plus Cache-Control: no-cache.
# Without it the browser guesses freshness for each ES module separately, and a
# reload can pair a new module with a stale one, which stops startup.
# It also answers byte ranges: Safari only plays <video> from servers that do.
# Usage: python3 tools/serve.py [port] [--lan]
#   With no port, the OS picks a free one and the browser opens that address.
#   --lan also lets phones on the same Wi-Fi open it (and anyone else on that network, while it runs).
#   The chosen address is printed, and written to tools/.serve-url for the checks.
import functools, http.server, os, pathlib, signal, socket, subprocess, sys, threading, webbrowser

args = [a for a in sys.argv[1:] if a != '--lan']
lan = '--lan' in sys.argv[1:]
chosen = int(args[0]) if args else 0
root = pathlib.Path(__file__).resolve().parent.parent
url_file = root / 'tools' / '.serve-url'
host = '0.0.0.0' if lan else '127.0.0.1'

def open_browser(url):
    try:
        webbrowser.open(url)
    except OSError:
        pass

def stop(_signum, _frame):
    raise KeyboardInterrupt

for name in ('SIGTERM', 'SIGHUP'):
    if hasattr(signal, name):
        signal.signal(getattr(signal, name), stop)

node = ['node', '--env-file-if-exists=.env']
if os.environ.get('MONGODB_URI') or (root / '.env').exists():
    configured = subprocess.run(node + ['-e', 'process.exit(process.env.MONGODB_URI ? 0 : 1)'], cwd=root)
    if configured.returncode == 0:
        env = {**os.environ, 'HOST': host, 'PORT': str(chosen)}
        with subprocess.Popen(node + ['server/office.js'], cwd=root, env=env, stdout=subprocess.PIPE, text=True) as office:
            url = ''
            try:
                url = office.stdout.readline().strip()
                if url.startswith('http://127.0.0.1:'):
                    print(url, flush=True)
                    url_file.write_text(url)
                    if not chosen:
                        threading.Timer(0.2, open_browser, args=(url,)).start()
                raise SystemExit(office.wait())
            except KeyboardInterrupt:
                office.terminate()
            finally:
                if url and url_file.exists() and url_file.read_text() == url:
                    url_file.unlink()
        raise SystemExit(0)
    if configured.returncode != 1:
        raise SystemExit('Could not read the Node office configuration.')

class Handler(http.server.SimpleHTTPRequestHandler):
    left = None  # bytes still to send for a range reply

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        if self.path.split('?', 1)[0] in ['/homecraft.json', '/examples/terry-home/homecraft.json']:
            self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def send_head(self):
        pathname = pathlib.Path(self.translate_path(self.path)).relative_to(root)
        if any(part.startswith('.') for part in pathname.parts):
            self.send_error(404)
            return None
        spec = self.headers.get('Range', '')
        path = self.translate_path(self.path)
        if not spec.startswith('bytes=') or not os.path.isfile(path):
            return super().send_head()
        first, _, last = spec[6:].split(',')[0].strip().partition('-')
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404)
            return None
        size = os.fstat(f.fileno()).st_size
        try:
            start, end = (int(first), int(last) if last else size - 1) if first else (size - int(last), size - 1)
        except ValueError:
            f.close()
            return super().send_head()
        start, end = max(0, start), min(end, size - 1)
        if start > end:
            f.close()
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        f.seek(start)
        self.left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        if self.left is None:
            return super().copyfile(source, outputfile)
        while self.left > 0:
            chunk = source.read(min(64 * 1024, self.left))
            if not chunk:
                break
            outputfile.write(chunk)
            self.left -= len(chunk)

try:
    server = http.server.ThreadingHTTPServer((host, chosen), functools.partial(Handler, directory=str(root)))
except OSError:
    raise SystemExit(f'Port {chosen} is already in use.')
port = server.server_address[1]
url = f'http://127.0.0.1:{port}/'
print(url, flush=True)
if lan:
    # The address this computer uses on the local network (nothing is sent).
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(('10.255.255.255', 1))
        print(f'http://{probe.getsockname()[0]}:{port}/   (phones on the same Wi-Fi)', flush=True)
    except OSError:
        pass
    finally:
        probe.close()
url_file.write_text(url)
if not chosen:
    threading.Timer(0.2, open_browser, args=(url,)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
    try:
        if url_file.read_text() == url:
            url_file.unlink()
    except OSError:
        pass
