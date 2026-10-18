import unittest

from server import simulate


class SimulatorTests(unittest.TestCase):
    def test_request_count_is_preserved(self):
        result = simulate(request_count=21, max_batch_size=4)
        self.assertEqual(result["request_count"], 21)
        self.assertEqual(sum(batch["size"] for batch in result["batches"]), 21)

    def test_batch_size_one_never_groups_requests(self):
        result = simulate(request_count=9, max_batch_size=1)
        self.assertEqual(result["batch_count"], 9)
        self.assertEqual(result["avg_batch_size"], 1)

    def test_wait_window_changes_batching_under_bursty_load(self):
        without_wait = simulate(
            request_count=32, arrival_interval_ms=30,
            max_batch_size=4, max_wait_ms=0, pattern="steady",
        )
        with_wait = simulate(
            request_count=32, arrival_interval_ms=30,
            max_batch_size=4, max_wait_ms=100, pattern="steady",
        )
        self.assertLess(with_wait["batch_count"], without_wait["batch_count"])
        self.assertGreater(with_wait["avg_latency_ms"], without_wait["avg_latency_ms"])

    def test_metrics_are_finite_and_positive(self):
        result = simulate(request_count=48, pattern="bursty")
        self.assertGreater(result["throughput_rps"], 0)
        self.assertGreater(result["avg_latency_ms"], 0)
        self.assertGreaterEqual(result["p95_latency_ms"], result["avg_latency_ms"])


if __name__ == "__main__":
    unittest.main()
