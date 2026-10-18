import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown,
  CircleHelp, Clock3, Cpu, Gauge, Layers3, LoaderCircle, Play, RotateCcw,
  Sparkles, Zap,
} from 'lucide-react'
import './styles.css'

const initial = {
  request_count: 48,
  arrival_interval_ms: 18,
  max_wait_ms: 24,
  max_batch_size: 4,
  pattern: 'steady',
}

function MetricCard({ icon: Icon, label, value, unit, note, tone = 'green' }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={17} /></div>
      <span className="metric-label">{label}</span>
      <div className="metric-value">{value ?? '—'}<small>{unit}</small></div>
      <span className="metric-note">{note}</span>
    </article>
  )
}

function RangeControl({ label, value, min, max, step = 1, suffix = '', onChange, hint }) {
  return (
    <label className="control-block">
      <span className="control-head"><span>{label}</span><strong>{value}{suffix}</strong></span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="control-hint">{hint}</span>
    </label>
  )
}

function MiniChart({ title, subtitle, values, metric, color, format, icon: Icon, goal }) {
  const width = 410
  const height = 180
  const left = 42
  const right = 18
  const top = 18
  const bottom = 35
  const maxValue = Math.max(...values.map((item) => item[metric]), 1)
  const minValue = Math.min(...values.map((item) => item[metric]))
  const spread = Math.max(maxValue - minValue, maxValue * 0.25, 1)
  const low = Math.max(0, minValue - spread * 0.2)
  const high = maxValue + spread * 0.2
  const x = (index) => left + index * ((width - left - right) / Math.max(values.length - 1, 1))
  const y = (value) => top + (high - value) / (high - low) * (height - top - bottom)
  const path = values.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(item[metric])}`).join(' ')

  return (
    <article className="chart-card">
      <div className="chart-heading">
        <div className="chart-icon" style={{ color, backgroundColor: `${color}18` }}><Icon size={16} /></div>
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        <span className="chart-goal">{goal}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} by batch size`}>
        {[0, 1, 2, 3].map((line) => {
          const yy = top + line * ((height - top - bottom) / 3)
          return <g key={line}><line x1={left} x2={width - right} y1={yy} y2={yy} className="grid-line" /><text x={left - 8} y={yy + 4} textAnchor="end" className="axis-label">{format(high - line * (high - low) / 3)}</text></g>
        })}
        {values.length > 0 && <>
          <path d={`${path} L ${x(values.length - 1)} ${height - bottom} L ${x(0)} ${height - bottom} Z`} fill={`${color}14`} />
          <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {values.map((item, index) => <g key={item.max_batch_size}><circle cx={x(index)} cy={y(item[metric])} r="5" fill="white" stroke={color} strokeWidth="3" /><text x={x(index)} y={height - 11} textAnchor="middle" className="axis-label">{item.max_batch_size}</text></g>)}
        </>}
      </svg>
      <div className="chart-foot"><span>Maximum batch size</span><span>{values.length ? `${format(values[0][metric])} → ${format(values.at(-1)[metric])}` : 'Run a simulation'}</span></div>
    </article>
  )
}

function App() {
  const [settings, setSettings] = useState(initial)
  const [result, setResult] = useState(null)
  const [service, setService] = useState('checking')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const runSimulation = useCallback(async (nextSettings = settings) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!response.ok) throw new Error(`Simulation request failed (${response.status})`)
      setResult(await response.json())
      setService('online')
    } catch {
      setService('offline')
      setError('The simulator API is not running. Start server.py in a second terminal, then run again.')
    } finally {
      setLoading(false)
    }
  }, [settings])

  useEffect(() => {
    let active = true
    const loadInitialRun = async () => {
      try {
        const health = await fetch('/api/health')
        if (!health.ok) throw new Error('offline')
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initial),
        })
        if (!response.ok) throw new Error('simulation failed')
        const data = await response.json()
        if (active) { setService('online'); setResult(data) }
      } catch {
        if (active) setService('offline')
      }
    }
    loadInitialRun()
    return () => { active = false }
  }, [])

  const selected = result?.selected
  const sweep = result?.sweep ?? []
  const batchesShown = useMemo(() => (selected?.batches ?? []).slice(0, 8), [selected])

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BatchLab home">
          <span className="brand-mark"><Layers3 size={17} /></span>
          <span>batchlab<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          <span className="sim-badge"><span /> SIMULATOR · NO GPU REQUIRED</span>
          <span className={`api-status ${service}`}><span className="status-dot" /> API {service}</span>
        </div>
      </header>

      <main className="page-content" id="top">
        <section className="hero-row">
          <div>
            <div className="eyebrow"><Sparkles size={13} /> INFERENCE SYSTEMS, MADE VISIBLE</div>
            <h1>Understand the <span>batching trade-off.</span></h1>
            <p>Explore how grouping requests can change throughput and waiting time. Adjust the workload, run a simulation, and compare batch sizes.</p>
          </div>
          <div className="hero-note"><div className="hero-note-icon"><CircleHelp size={18} /></div><span><strong>Learning tool</strong><br />All timings are simulated.</span></div>
        </section>

        <section className="dashboard-grid">
          <aside className="controls-card">
            <div className="section-title"><div className="section-icon"><Cpu size={17} /></div><div><h2>Workload setup</h2><p>Choose a request pattern</p></div></div>
            <label className="select-control"><span>Traffic pattern</span><span className="select-wrap"><select value={settings.pattern} onChange={(event) => update('pattern', event.target.value)}><option value="steady">Steady arrivals</option><option value="bursty">Bursty arrivals</option></select><ChevronDown size={15} /></span></label>
            <RangeControl label="Requests" value={settings.request_count} min={12} max={120} step={4} onChange={(value) => update('request_count', value)} hint="Total requests in this run" />
            <RangeControl label={settings.pattern === 'steady' ? 'Arrival interval' : 'Burst spacing'} value={settings.arrival_interval_ms} min={4} max={60} step={2} suffix=" ms" onChange={(value) => update('arrival_interval_ms', value)} hint={settings.pattern === 'steady' ? 'Time between arriving requests' : 'Time between groups of four'} />
            <RangeControl label="Queue wait budget" value={settings.max_wait_ms} min={0} max={80} step={4} suffix=" ms" onChange={(value) => update('max_wait_ms', value)} hint="Maximum time to wait for a fuller batch" />
            <div className="batch-control"><div className="batch-label"><span>Max batch size</span><strong>{settings.max_batch_size} requests</strong></div><div className="batch-options" role="group" aria-label="Maximum batch size">{[1, 2, 4, 8].map((size) => <button key={size} className={settings.max_batch_size === size ? 'batch-option selected' : 'batch-option'} onClick={() => update('max_batch_size', size)}>{size}</button>)}</div></div>
            <button className="run-button" onClick={() => runSimulation()} disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={17} /> : <Play size={16} fill="currentColor" />}
              {loading ? 'Simulating…' : 'Run simulation'}
            </button>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="reset-button" onClick={() => { setSettings(initial); runSimulation(initial) }}><RotateCcw size={13} /> Reset to defaults</button>
          </aside>

          <div className="results-area">
            <div className="results-head"><div><h2>Simulation results</h2><p>{selected ? `${selected.request_count} ${selected.pattern} requests · ${selected.batch_count} batches formed` : 'Run a simulation to see what changes'}</p></div><span className="result-tag"><Activity size={13} /> SYNTHETIC WORKLOAD</span></div>
            <div className="metrics-grid">
              <MetricCard icon={Zap} label="Throughput" value={selected?.throughput_rps} unit="req/s" note="Requests completed per second" tone="green" />
              <MetricCard icon={Clock3} label="Average latency" value={selected?.avg_latency_ms} unit="ms" note="Arrival to batch completion" tone="orange" />
              <MetricCard icon={Gauge} label="P95 latency" value={selected?.p95_latency_ms} unit="ms" note="95% of requests finish by" tone="purple" />
              <MetricCard icon={Layers3} label="Average batch" value={selected?.avg_batch_size} unit="req" note={`${selected?.batch_count ?? '—'} batches in this run`} tone="blue" />
            </div>

            <div className="charts-grid">
              <MiniChart title="Throughput" subtitle="Higher can be better" values={sweep} metric="throughput_rps" color="#4b8067" format={(v) => `${Number(v).toFixed(0)}`} icon={ArrowUpRight} goal="REQ / SEC" />
              <MiniChart title="Average latency" subtitle="Lower usually feels faster" values={sweep} metric="avg_latency_ms" color="#d58a65" format={(v) => `${Number(v).toFixed(0)}`} icon={ArrowDownRight} goal="MILLISECONDS" />
            </div>

            <article className="timeline-card">
              <div className="timeline-heading"><div><h3><BarChart3 size={16} /> Batch timeline</h3><p>Each block represents one batch from the selected run.</p></div><span className="timeline-legend"><span /> One request</span></div>
              {batchesShown.length ? <div className="batch-timeline" aria-label="First batches in the simulated run">{batchesShown.map((batch) => <div className="timeline-item" key={batch.id}><span className="timeline-batch-label">B{String(batch.id).padStart(2, '0')}</span><div className="request-blocks">{Array.from({ length: batch.size }, (_, index) => <span key={index} />)}</div><span className="timeline-count">{batch.size} req</span></div>)}</div> : <div className="timeline-empty">Run a simulation to see how requests are grouped.</div>}
              <div className="timeline-foot"><span>Showing up to 8 of {selected?.batch_count ?? 0} batches</span><span>Arrival order →</span></div>
            </article>
          </div>
        </section>
        <footer className="page-footer"><span>BatchLab is a deterministic teaching simulator, not a real model benchmark.</span><span>Python API <b>·</b> React dashboard</span></footer>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
