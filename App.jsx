import { useState } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000/api/ask-expert'

function App() {
  const [question, setQuestion] = useState('')
  const [plugin, setPlugin] = useState('cyber') // 'none' or 'cyber'
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState([])
  const [steps, setSteps] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim()) return

    setIsLoading(true)
    setError('')
    setAnswer('')
    setCitations([])
    setSteps([])

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // We now send the selected plugin to the backend!
        body: JSON.stringify({ question, plugin }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Backend error')
      }

      const data = await res.json()
      setAnswer(data.answer || '')
      setCitations(data.citations || [])
      setSteps(data.steps || [])
    } catch (err) {
      console.error('Ask expert failed', err)
      setError(err.message || 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>SME-Plug Architecture</h1>
          <p className="subtitle">
            Hot-swappable domain expertise with strict RAG enforcement.
          </p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel query-panel">
          <form onSubmit={handleAsk}>
            
            {/* The Hot-Swappable Plugin Selector */}
            <div className="plugin-selector">
              <span className="field-label">Active Module:</span>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${plugin === 'none' ? 'active generic' : ''}`}
                  onClick={() => setPlugin('none')}
                >
                  Generic LLM (No SME)
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${plugin === 'cyber' ? 'active expert' : ''}`}
                  onClick={() => setPlugin('cyber')}
                >
                  Cybersecurity SME
                </button>
              </div>
            </div>

            <label className="field-label" style={{ marginTop: '0.5rem' }}>
              Ask a compliance question
            </label>
            <textarea
              className="question-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What does ISO‑27001 require for access control logging?"
              rows={4}
            />
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isLoading}>
                {isLoading ? 'Processing via LangGraph…' : 'Execute Query'}
              </button>
            </div>
          </form>

          {error && <div className="error-banner">{error}</div>}

          {answer && (
            <div className="answer-block">
              <h2>Final Output</h2>
              <p>{answer}</p>

              {citations.length > 0 && (
                <div className="citations">
                  <h3>Verified Citations (Source of Truth)</h3>
                  <div className="citation-tags">
                    {citations.map((c) => (
                      <span key={c} className="citation-chip">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel log-panel">
          <h2>Decision Tree Runtime</h2>
          {steps.length === 0 && (
            <p className="placeholder">Awaiting query to trace reasoning logic...</p>
          )}
          <ol className="steps-list">
            {steps.map((step, idx) => (
              <li key={`${step.node}-${idx}`} className="step-item">
                <div className="step-header">
                  <span className="step-node">{step.node}</span>
                  <span className={`step-status step-status-${step.status}`}>
                    {step.status}
                  </span>
                </div>
                <p className="step-detail">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  )
}

export default App