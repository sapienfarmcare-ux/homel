import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Download, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { normalizeKenyanPhone, isValidKenyanPhone, exportToCSV } from '@/lib/utils';
import { Card, Button, Badge, ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/ui';

interface ImportRow {
  rowIndex: number;
  name: string;
  phone: string;
  normalizedPhone: string;
  status: 'valid' | 'invalid' | 'duplicate' | 'existing';
  error: string;
  selected: boolean;
}

interface ImportResults {
  created: number;
  skipped: number;
  duplicate: number;
  invalid: number;
  failed: number;
  errors: { name: string; phone: string; error: string }[];
}

export function ExcelImport() {
  const toast = useToast();
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    setFileName(file.name);
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const nameKey = findKey(json[0] || {}, ['full name', 'name', 'member name', 'member']);
      const phoneKey = findKey(json[0] || {}, ['phone number', 'phone', 'mobile', 'tel', 'number']);

      if (!nameKey || !phoneKey) {
        toast.error('Could not find "Full Name" and "Phone Number" columns in the file');
        setLoading(false);
        return;
      }

      const parsed: ImportRow[] = [];
      const seenPhones = new Set<string>();

      for (let i = 0; i < json.length; i++) {
        const rawName = String(json[i][nameKey] || '').trim();
        const rawPhone = String(json[i][phoneKey] || '').trim();
        const normalized = normalizeKenyanPhone(rawPhone);
        let status: ImportRow['status'] = 'valid';
        let error = '';

        if (!rawName) { status = 'invalid'; error = 'Missing name'; }
        else if (!rawPhone) { status = 'invalid'; error = 'Missing phone number'; }
        else if (!isValidKenyanPhone(rawPhone)) { status = 'invalid'; error = 'Invalid phone number'; }
        else if (normalized && seenPhones.has(normalized)) { status = 'duplicate'; error = 'Duplicate within file'; }
        else if (normalized) seenPhones.add(normalized);

        parsed.push({ rowIndex: i + 2, name: rawName, phone: rawPhone, normalizedPhone: normalized || rawPhone, status, error, selected: status === 'valid' });
      }

      // Check existing members
      const validPhones = parsed.filter((r) => r.status === 'valid').map((r) => r.normalizedPhone);
      if (validPhones.length > 0) {
        const { data: existing } = await supabase.from('app_users').select('phone').in('phone', validPhones).eq('role', 'member');
        const existingPhones = new Set((existing || []).map((e) => e.phone));
        parsed.forEach((r) => {
          if (r.status === 'valid' && existingPhones.has(r.normalizedPhone)) {
            r.status = 'existing';
            r.error = 'Already registered';
          }
        });
      }

      setRows(parsed);
      setStep('preview');
    } catch (e) {
      toast.error('Failed to read the Excel file');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  function findKey(obj: Record<string, unknown>, candidates: string[]): string | null {
    const keys = Object.keys(obj);
    for (const candidate of candidates) {
      const found = keys.find((k) => k.toLowerCase().trim() === candidate);
      if (found) return found;
    }
    // Fuzzy match
    for (const candidate of candidates) {
      const found = keys.find((k) => k.toLowerCase().includes(candidate));
      if (found) return found;
    }
    return null;
  }

  const validRows = rows.filter((r) => r.status === 'valid' && r.selected);
  const invalidRows = rows.filter((r) => r.status === 'invalid');
  const duplicateRows = rows.filter((r) => r.status === 'duplicate');
  const existingRows = rows.filter((r) => r.status === 'existing');

  async function doImport() {
    setShowConfirm(false);
    setImporting(true);
    const toImport = rows.filter((r) => r.status === 'valid' && r.selected);
    let created = 0, skipped = 0, duplicate = 0, invalid = 0, failed = 0;
    const errors: { name: string; phone: string; error: string }[] = [];

    for (const row of toImport) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: `${row.normalizedPhone}@church.local`,
          password: 'Member2026',
          options: { data: { full_name: row.name, phone: row.normalizedPhone, role: 'member', must_change_password: true } },
        });
        if (error) {
          if (error.message.includes('already')) { duplicate++; skipped++; }
          else { failed++; errors.push({ name: row.name, phone: row.phone, error: error.message }); }
        } else {
          created++;
        }
      } catch {
        failed++;
        errors.push({ name: row.name, phone: row.phone, error: 'Unexpected error' });
      }
    }

    invalid += invalidRows.length;
    duplicate += duplicateRows.length;
    skipped += existingRows.length;

    await logAudit('member_import', 'app_users', '', undefined, { created, skipped, duplicate, invalid, failed });
    setResults({ created, skipped, duplicate, invalid, failed, errors });
    setStep('results');
    setImporting(false);
    toast.success(`Import complete: ${created} members created`);
  }

  function reset() {
    setStep('upload');
    setRows([]);
    setFileName('');
    setResults(null);
  }

  function downloadErrorReport() {
    if (!results) return;
    exportToCSV('import-errors.csv', ['Name', 'Phone', 'Error'], results.errors.map((e) => [e.name, e.phone, e.error]));
  }

  const steps = ['Upload', 'Preview', 'Results'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import Members</h1>
        <p className="text-sm text-gray-500 mt-1">Upload an Excel file to create member accounts in bulk</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${step === s.toLowerCase() ? 'bg-primary-600 text-white' : i < steps.findIndex((x) => x.toLowerCase() === step) ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
              {s}
            </div>
            {i < steps.length - 1 && <ArrowRight className="w-4 h-4 text-gray-400" />}
          </div>
        ))}
      </div>

      {step === 'upload' && (
        <Card className="p-8">
          {loading ? <LoadingSpinner label="Reading Excel file..." /> : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50'}`}
            >
              <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-base font-medium text-gray-900 mb-1">Drop your Excel file here</p>
              <p className="text-sm text-gray-500 mb-4">or click to browse. Supports .xlsx and .xls files</p>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" /> Choose File
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
              <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200 max-w-md mx-auto text-left">
                <p className="text-sm font-medium text-gray-900 mb-2">Expected columns:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Full Name - Member's full name</li>
                  <li>• Phone Number - Kenyan phone number (e.g. 0712345678)</li>
                </ul>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3"><p className="text-xs text-gray-500">Total Rows</p><p className="text-lg font-bold text-gray-900">{rows.length}</p></Card>
            <Card className="p-3"><p className="text-xs text-gray-500">Valid</p><p className="text-lg font-bold text-emerald-600">{validRows.length}</p></Card>
            <Card className="p-3"><p className="text-xs text-gray-500">Invalid/Duplicates</p><p className="text-lg font-bold text-amber-600">{invalidRows.length + duplicateRows.length}</p></Card>
            <Card className="p-3"><p className="text-xs text-gray-500">Already Exist</p><p className="text-lg font-bold text-blue-600">{existingRows.length}</p></Card>
          </div>

          <Card>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-medium text-gray-900">Preview - {fileName}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}><ArrowLeft className="w-4 h-4" /> Back</Button>
                <Button size="sm" disabled={validRows.length === 0 || importing} loading={importing} onClick={() => setShowConfirm(true)}>Import {validRows.length} Members</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Row</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Normalized</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Import?</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r) => (
                    <tr key={r.rowIndex} className={`text-sm ${r.status === 'invalid' ? 'bg-red-50' : r.status === 'duplicate' ? 'bg-amber-50' : r.status === 'existing' ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2 text-gray-500">{r.rowIndex}</td>
                      <td className="px-3 py-2 text-gray-900">{r.name || <span className="text-red-400">—</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{r.normalizedPhone}</td>
                      <td className="px-3 py-2">
                        {r.status === 'valid' && <Badge variant="success"><CheckCircle className="w-3 h-3 inline mr-1" /> Valid</Badge>}
                        {r.status === 'invalid' && <Badge variant="danger"><XCircle className="w-3 h-3 inline mr-1" /> {r.error}</Badge>}
                        {r.status === 'duplicate' && <Badge variant="warning"><AlertCircle className="w-3 h-3 inline mr-1" /> {r.error}</Badge>}
                        {r.status === 'existing' && <Badge variant="info">{r.error}</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'valid' && <input type="checkbox" checked={r.selected} onChange={(e) => { setRows((prev) => prev.map((x) => x.rowIndex === r.rowIndex ? { ...x, selected: e.target.checked } : x)); }} className="w-4 h-4 rounded border-gray-300 text-primary-600" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {step === 'results' && results && (
        <Card className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex w-16 h-16 bg-emerald-100 rounded-full items-center justify-center mb-4"><CheckCircle className="w-8 h-8 text-emerald-600" /></div>
            <h2 className="text-xl font-bold text-gray-900">Import Complete</h2>
            <p className="text-sm text-gray-500">All valid rows have been processed</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-emerald-50 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{results.created}</p><p className="text-xs text-emerald-700">Created</p></div>
            <div className="bg-blue-50 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-blue-600">{results.skipped}</p><p className="text-xs text-blue-700">Skipped</p></div>
            <div className="bg-amber-50 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-amber-600">{results.duplicate}</p><p className="text-xs text-amber-700">Duplicate</p></div>
            <div className="bg-red-50 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-red-600">{results.invalid}</p><p className="text-xs text-red-700">Invalid</p></div>
            <div className="bg-gray-100 rounded-xl p-4 text-center"><p className="text-2xl font-bold text-gray-600">{results.failed}</p><p className="text-xs text-gray-700">Failed</p></div>
          </div>
          {results.errors.length > 0 && (
            <div className="mb-6">
              <Button variant="outline" size="sm" onClick={downloadErrorReport}><Download className="w-4 h-4" /> Download Error Report</Button>
            </div>
          )}
          <Button onClick={reset}>Import Another File</Button>
        </Card>
      )}

      <ConfirmDialog isOpen={showConfirm} onClose={() => setShowConfirm(false)} onConfirm={doImport} title="Confirm Import" message={`You are about to create ${validRows.length} member accounts. Each member will get the initial password Member2026 and must change it on first login.`} confirmLabel="Create Accounts" />
    </div>
  );
}
