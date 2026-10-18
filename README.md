# BatchLab

BatchLab is a small interactive simulator for exploring the latency and throughput trade-off in request batching. It pairs a Python HTTP API with a React dashboard.

> This is a deterministic teaching simulator. It does not run an AI model, use a GPU, or predict real hardware performance.

## What it demonstrates

- FIFO request grouping with a maximum batch size and queue-wait budget
- Steady and bursty synthetic request arrivals
- Average and p95 request latency, requests per second, and average batch size
- A batch-size sweep so you can compare settings on the same workload
- A single simulated worker, so batches wait for earlier batches to finish

The service-time model is intentionally simple: each batch has an 8 ms fixed overhead plus 10 ms per request. You can inspect and change this model in `server.py`.

## Run locally

You need Python 3.10+ and Node.js 20+.

1. In a terminal at the project root, start the API:

   ```bash
   python server.py
   ```

   On Windows, `py server.py` also works.

2. Open a second terminal and start the dashboard:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open the local URL printed by Vite, usually `http://127.0.0.1:5173`.

Stop either server with Ctrl+C in its terminal.

## Tests and build

From the project root:

```bash
python -m unittest discover -s tests
```

From `frontend/`:

```bash
npm run build
npm run lint
```

## API

- `GET /api/health` returns the simulator's status.
- `POST /api/simulate` accepts `request_count`, `arrival_interval_ms`, `max_batch_size`, `max_wait_ms`, and `pattern` (`steady` or `bursty`). The response includes the selected run and a sweep for batch sizes 1, 2, 4, and 8.

## Ideas for a next iteration

- Add a Poisson arrival profile and compare it with the current deterministic patterns.
- Plot individual request wait time alongside service time.
- Add a real model backend later and clearly separate measured results from simulated results.
