"""Local cold-start comparison; baseline files must be captured before editing."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'output/startup-speed/baseline'

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route = self.path.split('?', 1)[0]
        if route == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        match = re.fullmatch(r'/(baseline|optimized)/(.+)', route)
        if match:
            mode, name = match.groups()
            path = (ROOT / 'dist' / name).resolve()
            if not path.is_relative_to(ROOT / 'dist'):
                self.send_error(403)
                return
            saved = BASE / name
            if mode == 'baseline' and saved.is_file():
                path = saved
        else:
            path = ROOT / 'qa/startup-speed/index.html'
        if not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        if match and name == 'app.js':
            source = data.decode()
            source = source.replace('rebuild(42);', "performance.mark('world-begin');rebuild(42);performance.mark('world-end');")
            source = source.replace('const next = buildCity(THREE, { seed });', "performance.mark('city-begin');const next = buildCity(THREE, { seed });performance.mark('city-end');")
            source = source.replace('garage = createGarageScene(THREE, city, {document});', "performance.mark('garage-begin');garage = createGarageScene(THREE, city, {document});performance.mark('garage-end');")
            source = source.replace('startup.start(initialAssets,{', "startup.start(initialAssets.then(()=>{performance.mark('assets-ready');}),{")
            source = source.replace('async prepare(){', "async prepare(){performance.mark('prepare-begin');")
            source = source.replace('render(){renderScene();}', "render(){performance.mark('prepare-end');renderScene();}")
            data = source.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript' if path.suffix == '.js' else self.guess_type(str(path)))
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    print('Startup comparison: http://127.0.0.1:8767', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8767), Handler).serve_forever()
