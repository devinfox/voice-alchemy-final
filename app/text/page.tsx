'use client'

import { useState } from 'react'

export default function TextPage() {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const sendText = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('')
    setLoading(true)

    const response = await fetch('/api/text/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, message }),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setStatus(result.error || 'failed')
    } else {
      setStatus(`sent to ${result.to}`)
      setMessage('')
    }

    setLoading(false)
  }

  return (
    <main>
      <h1>text</h1>
      <form onSubmit={sendText}>
        <p>
          <label htmlFor="phone">phone 10 digits no +1 no dashes</label>
          <br />
          <input
            id="phone"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="4156045517"
            inputMode="numeric"
            autoComplete="tel"
          />
        </p>
        <p>
          <label htmlFor="message">message</label>
          <br />
          <textarea
            id="message"
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={10}
            cols={60}
          />
        </p>
        <button type="submit" disabled={loading}>
          {loading ? 'sending' : 'send'}
        </button>
      </form>
      {status && <p>{status}</p>}
    </main>
  )
}
