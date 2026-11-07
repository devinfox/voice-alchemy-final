'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, Users, X } from 'lucide-react'
import {
  IMPORT_BATCH_SIZE, IMPORT_FIELDS, MAX_FILE_BYTES, importIssuesCsv, mapLeadRow, parseLeadCsv,
  subscriptionFromFileName, suggestLeadMapping,
  type ImportField, type ImportOptions, type ImportResult, type ImportSheet, type Mapping, type Subscription,
} from '@/lib/lead-import'

const GOLD_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#CEB466] via-[#e2c974] to-[#CEB466] px-5 py-2.5 text-sm font-semibold text-[#171229] transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed'
const SECONDARY_BUTTON = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-40'
const SUBSCRIPTIONS: { value: Subscription; label: string }[] = [
  { value: 'non-subscribed', label: 'Not subscribed to marketing' },
  { value: 'subscribed', label: 'Subscribed — permission to email' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'cleaned', label: 'Cleaned / bounced' },
]

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ImportLeads() {
  const input = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<{ name: string; sheet: ImportSheet } | null>(null)

  async function openFile(selected?: File) {
    if (!selected || parsing) return
    setError(null)
    if (!/\.(csv|tsv)$/i.test(selected.name)) { setError('Choose a CSV file. For a Mailchimp ZIP export, unzip it first and choose a CSV inside.'); return }
    if (selected.size > MAX_FILE_BYTES) { setError('Choose a file smaller than 10 MB. You can import larger lists in separate files.'); return }
    setParsing(true)
    try { setFile({ name: selected.name, sheet: parseLeadCsv(await selected.text()) }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read this file.') }
    finally { setParsing(false); if (input.current) input.current.value = '' }
  }

  function drop(event: DragEvent) {
    event.preventDefault(); depth.current = 0; setDragging(false)
    if (event.dataTransfer.files.length !== 1) { setError('Drop one CSV file at a time.'); return }
    void openFile(event.dataTransfer.files[0])
  }

  return <>
    <section
      aria-label="Import leads from CSV"
      className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 transition-colors ${dragging ? 'border-[#CEB466] bg-[#CEB466]/15' : 'border-[#CEB466]/25 bg-gradient-to-br from-[#302344] via-[#20182f] to-[#171229]'}`}
      onDragEnter={e => { e.preventDefault(); depth.current++; setDragging(true) }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
      onDragLeave={e => { e.preventDefault(); if (--depth.current <= 0) setDragging(false) }}
      onDrop={drop}
    >
      <div className="relative flex flex-wrap items-center gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#CEB466]/30 bg-[#CEB466]/10 text-[#CEB466]">
          {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-luxury text-xl text-white">{dragging ? 'Drop your CSV here' : 'Bring your community to Voice Alchemy'}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-300">Drag in a CSV and we’ll match the columns for you. Review your singers and coaches before importing.</p>
          <p className="mt-2 text-xs text-[#CEB466]/80">CSV or TSV · up to 25,000 leads · 10 MB</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button type="button" className={GOLD_BUTTON} onClick={() => input.current?.click()} disabled={parsing}>
            <FileSpreadsheet className="h-4 w-4" /> {parsing ? 'Reading file…' : 'Import leads'}
          </button>
          <button type="button" className="text-xs text-gray-400 hover:text-[#CEB466]" onClick={() => download('Email Address,First Name,Last Name,Singer or Coach,Source,Email Marketing Status\nexample@example.com,Alex,River,Singer,Workshop,non-subscribed\n', 'voice-alchemy-leads-template.csv')}>Download sample CSV</button>
        </div>
      </div>
      <input ref={input} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="sr-only" aria-label="Choose lead CSV" onChange={e => void openFile(e.target.files?.[0])} />
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    </section>
    {file && <ImportDialog file={file} onClose={() => setFile(null)} />}
  </>
}

function ImportDialog({ file, onClose }: { file: { name: string; sheet: ImportSheet }; onClose: () => void }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const running = useRef(false)
  const [step, setStep] = useState<'map' | 'review' | 'import'>('map')
  const [mapping, setMapping] = useState<Mapping>(() => suggestLeadMapping(file.sheet.headers))
  const [options, setOptions] = useState<ImportOptions>({ persona: 'singer', source: /mailchimp|subscribed|cleaned/i.test(file.name) ? 'Mailchimp' : 'CSV import', duplicates: 'skip', subscription: subscriptionFromFileName(file.name) })
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportResult>({ processed: 0, created: 0, updated: 0, skipped: 0, failed: 0, issues: [] })
  const [finished, setFinished] = useState(false)
  const [stopped, setStopped] = useState(false)
  const { sheet } = file
  const mappedFields = Object.values(mapping).filter(Boolean)
  const hasEmail = mappedFields.includes('email')
  const busy = step === 'import' && !finished

  useEffect(() => {
    dialog.current?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const review = useMemo(() => {
    const seen = new Set<string>()
    let invalid = 0, duplicates = 0, restricted = 0
    const preview: { lead: ReturnType<typeof mapLeadRow>['lead']; errors: string[]; row: number }[] = []
    sheet.rows.forEach((row, i) => {
      const mapped = mapLeadRow(sheet.headers, row, mapping, options)
      if (mapped.errors.length) invalid++
      else if (seen.has(mapped.lead.email)) duplicates++
      else { seen.add(mapped.lead.email); if (mapped.lead.is_unsubscribed) restricted++ }
      if (i < 6) preview.push({ ...mapped, row: i + 2 })
    })
    return { valid: seen.size, invalid, duplicates, restricted, preview }
  }, [sheet, mapping, options])

  async function run() {
    if (running.current) return
    running.current = true
    setStep('import'); setError(null); setFinished(false); setStopped(false)
    const totals: ImportResult = { processed: 0, created: 0, updated: 0, skipped: 0, failed: 0, issues: [] }
    setProgress({ ...totals })
    try {
      for (let offset = 0; offset < sheet.rows.length;) {
        let size = Math.min(IMPORT_BATCH_SIZE, sheet.rows.length - offset)
        const payload = () => JSON.stringify({ headers: sheet.headers, rows: sheet.rows.slice(offset, offset + size), mapping, options, fileName: file.name, firstRow: offset + 2 })
        let body = payload()
        while (new TextEncoder().encode(body).length > 1_500_000 && size > 1) { size = Math.ceil(size / 2); body = payload() }
        const response = await fetch('/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.result) throw new Error(data.error || 'The import could not continue. Check your connection and try again.')
        const result = data.result as ImportResult
        for (const key of ['processed', 'created', 'updated', 'skipped', 'failed'] as const) totals[key] += result[key]
        totals.issues.push(...result.issues)
        setProgress({ ...totals, issues: [...totals.issues] })
        offset += size
      }
    } catch (err) {
      setStopped(true)
      setError(`${err instanceof Error ? err.message : 'Connection lost.'} Leads already saved are kept. Reimport with “Skip duplicates” to safely continue; totals below include confirmed batches only.`)
    } finally {
      setFinished(true); running.current = false; router.refresh()
    }
  }

  const pct = Math.round(progress.processed / sheet.rows.length * 100)
  return <dialog ref={dialog} aria-labelledby="import-title" className="m-auto w-[calc(100%_-_2rem)] max-w-4xl max-h-[90dvh] overflow-hidden rounded-3xl border border-[#CEB466]/35 bg-[#171229] p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm" onCancel={e => { e.preventDefault(); if (!busy) onClose() }}>
    <div className="flex max-h-[90dvh] flex-col">
      <header className="border-b border-white/10 bg-gradient-to-r from-[#302344] to-[#171229] px-5 py-5 sm:px-8">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-[#CEB466]/10 p-3 text-[#CEB466]"><FileSpreadsheet className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#CEB466]">Voice Alchemy Academy</p><h2 id="import-title" className="mt-1 font-luxury text-2xl">Import your community</h2><p className="mt-1 truncate text-xs text-gray-400">{file.name} · {sheet.rows.length.toLocaleString()} rows</p></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close import" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"><X className="h-5 w-5" /></button>
        </div>
        <ol className="mt-5 flex gap-2 sm:gap-6" aria-label="Import steps">{(['map', 'review', 'import'] as const).map((s, i) => <li key={s} aria-current={step === s ? 'step' : undefined} className={`flex items-center gap-2 text-xs ${step === s ? 'text-[#CEB466]' : 'text-gray-500'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full border ${step === s ? 'border-[#CEB466]/50 bg-[#CEB466]/10' : 'border-white/10'}`}>{i + 1}</span>{['Match columns', 'Review leads', 'Import'][i]}</li>)}</ol>
      </header>

      <div className="min-h-0 overflow-y-auto p-5 sm:px-8 sm:py-6">
        {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
        {step === 'map' && <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-semibold">A place for every detail</h3><p className="mt-1 text-sm text-gray-400">We matched {mappedFields.length} columns. Adjust any match below.</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-[#CEB466]/10 px-3 py-1 text-xs text-[#CEB466]"><Check className="h-3.5 w-3.5" /> Auto-matched</span></div>
          <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-xs uppercase tracking-wider text-gray-400"><tr><th className="px-4 py-3">Your CSV column</th><th className="px-4 py-3">Sample value</th><th className="px-4 py-3">Academy field</th></tr></thead><tbody className="divide-y divide-white/5">{sheet.headers.map((header, i) => <tr key={i}><th scope="row" className="max-w-48 px-4 py-3 font-medium break-words">{header}</th><td className="max-w-48 px-4 py-3"><span className="block truncate text-xs text-gray-400">{sheet.rows.find(r => r[i])?.[i] || '—'}</span></td><td className="px-4 py-3"><select aria-label={`Map column ${i + 1}: ${header}`} value={mapping[i] || ''} onChange={e => setMapping(m => ({ ...m, [i]: e.target.value as ImportField | '' }))} className="glass-select w-full min-w-48 text-sm"><option value="">Keep as additional detail</option>{IMPORT_FIELDS.map(f => <option key={f.key} value={f.key} disabled={mapping[i] !== f.key && mappedFields.includes(f.key)}>{f.label}{f.key === 'email' ? ' (required)' : ''}</option>)}</select></td></tr>)}</tbody></table></div>
          <p className={`mt-3 text-xs ${hasEmail ? 'text-gray-400' : 'text-amber-200'}`}>{hasEmail ? 'Unmatched columns are saved as additional lead details. Imported tags are kept as text and do not start automations.' : 'Match an email address column to continue.'}</p>
        </>}

        {step === 'review' && <>
          <h3 className="text-lg font-semibold">Make it feel at home</h3><p className="mt-1 text-sm text-gray-400">Choose how these leads join your Academy directory.</p>
          <div className="my-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs text-gray-300"><span>Default contact type</span><select className="glass-select w-full text-sm" value={options.persona} onChange={e => setOptions(o => ({ ...o, persona: e.target.value as 'singer' | 'coach' }))}><option value="singer">Singer</option><option value="coach">Coach</option></select></label>
            <label className="space-y-1.5 text-xs text-gray-300"><span>Source / list name</span><input className="glass-input w-full px-3 py-2 text-sm" maxLength={80} value={options.source} onChange={e => setOptions(o => ({ ...o, source: e.target.value }))} /></label>
            <label className="space-y-1.5 text-xs text-gray-300"><span>When an email address already exists</span><select className="glass-select w-full text-sm" value={options.duplicates} onChange={e => setOptions(o => ({ ...o, duplicates: e.target.value as 'skip' | 'update' }))}><option value="skip">Skip duplicates</option><option value="update">Update with non-empty imported details</option></select></label>
            <label className="space-y-1.5 text-xs text-gray-300"><span>{mappedFields.includes('subscription') ? 'Email status for blank cells' : 'Email status for this file'}</span><select className="glass-select w-full text-sm" value={options.subscription} onChange={e => setOptions(o => ({ ...o, subscription: e.target.value as Subscription }))}>{SUBSCRIPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
          </div>
          <p className="text-xs leading-relaxed text-gray-400">Mapped values take priority over defaults. Existing opt-outs are always preserved, including when duplicates are skipped. Only choose subscribed for contacts who gave permission to receive marketing.</p>
          <div className="my-5 grid grid-cols-3 gap-3">{[[review.valid, 'Valid emails'], [review.duplicates, 'Repeated in file'], [review.invalid, 'Rows with issues']].map(([value, label]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xl font-semibold text-[#CEB466]">{Number(value).toLocaleString()}</div><div className="mt-1 text-xs text-gray-400">{label}</div></div>)}</div>
          <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full text-left text-xs"><caption className="px-4 py-3 text-left text-xs text-gray-400">Preview · first {review.preview.length} rows</caption><thead className="bg-white/5 text-gray-400"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name / email</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Email eligibility</th></tr></thead><tbody className="divide-y divide-white/5">{review.preview.map(p => <tr key={p.row}><td className="px-3 py-3 text-gray-500">{p.row}</td><td className="px-3 py-3"><p>{[p.lead.first_name, p.lead.last_name].filter(Boolean).join(' ') || '—'}</p><p className="mt-1 text-gray-400">{p.lead.email || '(missing email)'}</p>{p.errors.length > 0 && <p className="mt-1 text-red-300">{p.errors.join('; ')}</p>}</td><td className="px-3 py-3 capitalize">{p.lead.persona}</td><td className="px-3 py-3 text-gray-400">{p.lead.is_unsubscribed ? 'No marketing emails' : 'Subscribed'}</td></tr>)}</tbody></table></div>
          <p className="mt-4 rounded-xl border border-[#CEB466]/20 bg-[#CEB466]/5 p-3 text-xs leading-relaxed text-[#e2d4ae]">This import saves leads only. It sends no emails and starts no funnels. Your paused automations stay paused.{review.invalid > 0 && ` ${review.invalid} invalid rows will be skipped with a downloadable report.`}</p>
        </>}

        {step === 'import' && <div className="py-5 text-center" aria-live="polite">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[#CEB466]/30 bg-[#CEB466]/10 text-[#CEB466]">{busy ? <Loader2 className="h-8 w-8 animate-spin" /> : stopped ? <FileSpreadsheet className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8" />}</div>
          <h3 className="font-luxury text-2xl">{busy ? 'Welcoming your leads…' : stopped ? 'Import stopped' : 'Your community is here'}</h3>
          <p className="mt-2 text-sm text-gray-400">{progress.processed.toLocaleString()} of {sheet.rows.length.toLocaleString()} rows processed{busy ? ' · keep this window open' : ''}</p>
          <div role="progressbar" aria-label="Import progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="mx-auto mt-5 h-2 max-w-lg overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#9c8644] to-[#e2c974] transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{[[progress.created, 'Added'], [progress.updated, 'Updated'], [progress.skipped, 'Duplicates skipped'], [progress.failed, 'Rows with issues']].map(([value, label]) => <div key={label} className="rounded-xl border border-white/10 p-4"><p className="text-2xl font-semibold text-[#CEB466]">{value}</p><p className="mt-1 text-xs text-gray-400">{label}</p></div>)}</div>
          {progress.issues.length > 0 && <button type="button" className={`${SECONDARY_BUTTON} mt-5`} onClick={() => download(importIssuesCsv(progress.issues), 'voice-alchemy-import-issues.csv')}><Download className="h-4 w-4" /> Download row issues</button>}
        </div>}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#171229] px-5 py-4 sm:px-8">
        {step === 'review' ? <button type="button" className={SECONDARY_BUTTON} onClick={() => setStep('map')}><ArrowLeft className="h-4 w-4" /> Columns</button> : <span className="text-xs text-gray-500">{step === 'map' ? 'Review before anything is saved' : 'Voice Alchemy Academy'}</span>}
        {step === 'map' && <button type="button" className={GOLD_BUTTON} disabled={!hasEmail} onClick={() => setStep('review')}>Review leads <ArrowRight className="h-4 w-4" /></button>}
        {step === 'review' && <button type="button" className={GOLD_BUTTON} disabled={!review.valid} onClick={() => void run()}><Users className="h-4 w-4" /> Import {review.valid.toLocaleString()} leads</button>}
        {step === 'import' && <button type="button" className={GOLD_BUTTON} disabled={busy} onClick={onClose}>{busy ? 'Importing…' : 'Back to leads'}{!busy && <ArrowRight className="h-4 w-4" />}</button>}
      </footer>
    </div>
  </dialog>
}
