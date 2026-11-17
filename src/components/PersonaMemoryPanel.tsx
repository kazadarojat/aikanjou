import { useState } from 'react';
import { Brain, Check, Edit2, Plus, Trash2, X } from 'lucide-react';
import type { MemoryCategory, PersonaMemoryItem } from '../lib/emotionEngine';

interface PersonaMemoryPanelProps {
  personaName: string;
  memories: PersonaMemoryItem[];
  onAddMemory: (category: MemoryCategory, content: string) => void;
  onUpdateMemory: (id: string, category: MemoryCategory, content: string) => void;
  onDeleteMemory: (id: string) => void;
  onClearMemories: () => void;
}

const CATEGORY_OPTIONS: { id: MemoryCategory; label: string; placeholder: string }[] = [
  { id: 'panggilan', label: 'Panggilan', placeholder: 'Mis. Suka dipanggil Kak atau Fahmi' },
  { id: 'minat', label: 'Minat', placeholder: 'Mis. Menyukai kopi hitam, musik lo-fi, dan astrofisika' },
  { id: 'hubungan', label: 'Hubungan', placeholder: 'Mis. Teman diskusi larut malam yang dipercaya' },
  { id: 'fakta', label: 'Fakta', placeholder: 'Mis. Sedang menyusun proyek aplikasi AI di Jakarta' },
];

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  panggilan: 'Panggilan',
  minat: 'Minat',
  hubungan: 'Hubungan',
  fakta: 'Fakta',
};

export function PersonaMemoryPanel({
  personaName,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearMemories,
}: PersonaMemoryPanelProps) {
  const [filterCat, setFilterCat] = useState<'all' | MemoryCategory>('all');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fakta');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<MemoryCategory>('fakta');
  const [editContent, setEditContent] = useState('');
  const [formError, setFormError] = useState('');

  const filteredMemories =
    filterCat === 'all' ? memories : memories.filter((m) => m.category === filterCat);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed) {
      setFormError('Isi catatan memori terlebih dahulu.');
      return;
    }
    onAddMemory(newCategory, trimmed);
    setNewContent('');
    setFormError('');
  };

  const startEdit = (item: PersonaMemoryItem) => {
    setEditingId(item.id);
    setEditCategory(item.category);
    setEditContent(item.content);
  };

  const saveEdit = (id: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    onUpdateMemory(id, editCategory, trimmed);
    setEditingId(null);
  };

  const selectedCatMeta =
    CATEGORY_OPTIONS.find((c) => c.id === newCategory) || CATEGORY_OPTIONS[3];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-text)]">
              <Brain className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Memori {personaName}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-muted)]">
              Hal penting tentang Anda (panggilan, minat, hubungan, atau fakta) akan diingat otomatis saat mengobrol dan dapat Anda ubah di sini.
            </p>
          </div>
          {memories.length > 0 && (
            <button
              type="button"
              onClick={onClearMemories}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 whitespace-nowrap"
            >
              Hapus Semua
            </button>
          )}
        </div>

        {/* Filter Kategori */}
        <div
          role="tablist"
          aria-label="Filter kategori memori"
          className="flex flex-wrap gap-1 rounded-lg bg-[var(--app-surface-alt)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterCat === 'all'}
            onClick={() => setFilterCat('all')}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
              filterCat === 'all'
                ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
            }`}
          >
            Semua ({memories.length})
          </button>
          {CATEGORY_OPTIONS.map((cat) => {
            const count = memories.filter((m) => m.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={filterCat === cat.id}
                onClick={() => setFilterCat(cat.id)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  filterCat === cat.id
                    ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-xs'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Daftar Memori */}
        {filteredMemories.length > 0 ? (
          <ul className="space-y-2" data-testid="memory-list">
            {filteredMemories.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-[var(--app-border-soft)] bg-[var(--app-surface-alt)] p-3"
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                        aria-label="Kategori memori yang diedit"
                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={2}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        aria-label="Isi memori yang diedit"
                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
                        >
                          <X className="h-3 w-3" />
                          <span>Batal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(item.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
                        >
                          <Check className="h-3 w-3" />
                          <span>Simpan</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--app-text-muted)]">
                          <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                            {CATEGORY_LABEL[item.category]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.source === 'auto' ? 'Terekam otomatis' : 'Ditulis manual'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {item.createdAt.includes('T')
                              ? new Date(item.createdAt).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : item.createdAt}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--app-text)]">
                          {item.content}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          aria-label={`Ubah memori ${item.content}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMemory(item.id)}
                          aria-label={`Hapus memori ${item.content}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-text-muted)] hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3.5 py-4 text-center text-xs text-[var(--app-text-muted)]">
            {memories.length === 0
              ? `Belum ada memori tersimpan untuk ${personaName}. Ceritakan nama, minat, atau detail pribadi di obrolan, atau tambahkan langsung di bawah.`
              : 'Tidak ada memori pada kategori ini.'}
          </div>
        )}

        {/* Form Tambah Memori Manual */}
        <form onSubmit={handleAdd} className="space-y-2.5 border-t border-[var(--app-border-soft)] pt-3">
          <div className="text-xs font-semibold text-[var(--app-text)]">Tambah Ingatan Manual</div>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            aria-label="Kategori memori baru"
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs text-[var(--app-text)] focus:border-indigo-500 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                Kategori: {c.label}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            value={newContent}
            onChange={(e) => {
              setNewContent(e.target.value);
              if (formError) setFormError('');
            }}
            aria-label="Isi catatan memori baru"
            placeholder={selectedCatMeta.placeholder}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-indigo-500 focus:outline-none"
          />
          {formError && <p className="text-xs text-rose-600 dark:text-rose-400">{formError}</p>}
          <button
            type="submit"
            className="flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Simpan ke Memori</span>
          </button>
        </form>
      </div>
    </div>
  );
}
