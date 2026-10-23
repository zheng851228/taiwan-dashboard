"""Static dev server for the dashboard (npm run dev / npm start / Playwright).

`python3 -m http.server` listens with a backlog of 5. Parallel Playwright workers
load many assets at once and overflow it, so connections were reset and, behind
the service worker's network-only rule for 127.0.0.1, a dropped style.css left the
style-recovery overlay covering the page. A larger backlog removes that.
"""
import contextlib
import functools
import http.server
import socket
import sys


DUAL_STACK = socket.has_dualstack_ipv6()


class DevServer(http.server.ThreadingHTTPServer):
    # Like `python3 -m http.server`: dual-stack where available, IPv4 otherwise.
    address_family = socket.AF_INET6 if DUAL_STACK else socket.AF_INET
    request_queue_size = 128

    def server_bind(self):
        if DUAL_STACK:
            with contextlib.suppress(Exception):
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
    with DevServer(('::' if DUAL_STACK else '0.0.0.0', port), handler) as server:
        print(f'Serving on http://127.0.0.1:{port}/', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
