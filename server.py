"""Small HTTP API for deterministic inference batching simulations.

This service models request arrival, queueing, and batch service time. It does
not load a model or measure GPU performance.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from statistics import mean


DEFAULTS = {
    "request_count": 48,
    "arrival_interval_ms": 18,
    "max_batch_size": 4,
    "max_wait_ms": 24,
    "pattern": "steady",
}


def _bounded_number(payload, key, default, lower, upper):
    try:
        value = float(payload.get(key, default))
    except (TypeError, ValueError):
        value = float(default)
    return max(lower, min(upper, value))


def make_arrivals(request_count, interval_ms, pattern):
    """Return deterministic arrival timestamps for steady or bursty traffic."""
    if pattern == "bursty":
        burst_size = 4
        within_burst_ms = 1.5
        return [
            (i // burst_size) * interval_ms * burst_size
            + (i % burst_size) * within_burst_ms
            for i in range(request_count)
        ]
    return [i * interval_ms for i in range(request_count)]


def simulate(request_count=48, arrival_interval_ms=18, max_batch_size=4,
             max_wait_ms=24, pattern="steady"):
    """Simulate FIFO micro-batches and return latency/throughput metrics."""
    request_count = int(_bounded_number({"n": request_count}, "n", 48, 1, 500))
    arrival_interval_ms = _bounded_number(
        {"v": arrival_interval_ms}, "v", 18, 1, 1000
    )
    max_batch_size = int(_bounded_number(
        {"v": max_batch_size}, "v", 4, 1, 32
    ))
    max_wait_ms = _bounded_number({"v": max_wait_ms}, "v", 24, 0, 500)
    if pattern not in {"steady", "bursty"}:
        pattern = "steady"

    arrivals = make_arrivals(request_count, arrival_interval_ms, pattern)
    request_latencies = [0.0] * request_count
    batches = []
    request_index = 0
    batch_service_overhead_ms = 8.0
    service_per_request_ms = 10.0
    worker_available_ms = 0.0

    while request_index < request_count:
        first_arrival = arrivals[request_index]
        deadline = first_arrival + max_wait_ms
        end_index = request_index
        while (
            end_index < request_count
            and end_index - request_index < max_batch_size
            and arrivals[end_index] <= deadline
        ):
            end_index += 1

        batch_size = end_index - request_index
        is_full = batch_size == max_batch_size
        # A full batch starts as soon as its final request arrives. An
        # underfilled batch waits until its oldest request reaches the deadline.
        batch_ready_at = arrivals[end_index - 1] if is_full else deadline
        service_start = max(batch_ready_at, worker_available_ms)
        service_ms = batch_service_overhead_ms + service_per_request_ms * batch_size
        service_end = service_start + service_ms
        worker_available_ms = service_end
        batch_number = len(batches) + 1

        for i in range(request_index, end_index):
            request_latencies[i] = service_end - arrivals[i]

        batches.append({
            "id": batch_number,
            "size": batch_size,
            "queued_at_ms": round(first_arrival, 2),
            "started_at_ms": round(service_start, 2),
            "finished_at_ms": round(service_end, 2),
            "service_ms": round(service_ms, 2),
        })
        request_index = end_index

    duration_ms = max(batches[-1]["finished_at_ms"] - arrivals[0], 1)
    sorted_latencies = sorted(request_latencies)
    p95_index = max(0, math.ceil(0.95 * len(sorted_latencies)) - 1)
    return {
        "request_count": request_count,
        "pattern": pattern,
        "max_batch_size": max_batch_size,
        "max_wait_ms": round(max_wait_ms, 2),
        "throughput_rps": round(request_count * 1000 / duration_ms, 2),
        "avg_latency_ms": round(mean(request_latencies), 2),
        "p95_latency_ms": round(sorted_latencies[p95_index], 2),
        "avg_batch_size": round(mean(batch["size"] for batch in batches), 2),
        "batch_count": len(batches),
        "duration_ms": round(duration_ms, 2),
        "batches": batches,
    }


def run_sweep(request_count, arrival_interval_ms, max_wait_ms, pattern):
    sizes = [1, 2, 4, 8]
    return [
        simulate(
            request_count=request_count,
            arrival_interval_ms=arrival_interval_ms,
            max_batch_size=size,
            max_wait_ms=max_wait_ms,
            pattern=pattern,
        )
        for size in sizes
    ]


class BatchLabHandler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path == "/api/health":
            self._send(200, {"ok": True, "service": "BatchLab simulator"})
        else:
            self._send(404, {"error": "Route not found"})

    def do_POST(self):
        if self.path != "/api/simulate":
            self._send(404, {"error": "Route not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            request_count = int(_bounded_number(
                payload, "request_count", DEFAULTS["request_count"], 1, 500
            ))
            interval = _bounded_number(
                payload, "arrival_interval_ms", DEFAULTS["arrival_interval_ms"], 1, 1000
            )
            wait = _bounded_number(
                payload, "max_wait_ms", DEFAULTS["max_wait_ms"], 0, 500
            )
            pattern = payload.get("pattern", "steady")
            if pattern not in {"steady", "bursty"}:
                pattern = "steady"
            selected_size = int(_bounded_number(payload, "max_batch_size", 4, 1, 32))
            selected = simulate(request_count, interval, selected_size, wait, pattern)
            self._send(200, {
                "selected": selected,
                "sweep": run_sweep(request_count, interval, wait, pattern),
            })
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send(400, {"error": "Send a valid JSON request body."})
        except (ValueError, TypeError):
            self._send(400, {"error": "Request values must be valid numbers."})

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), BatchLabHandler)
    print("BatchLab API running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBatchLab API stopped.")
        server.server_close()
