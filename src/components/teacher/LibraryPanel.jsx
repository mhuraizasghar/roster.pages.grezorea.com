import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Edit3,
  Folder,
  FolderPlus,
  Home,
  Move,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Send,
  Trash2,
  FileText,
  Download,
  Upload,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';

export default function LibraryPanel({
  folders,
  quizzes,
  trashFolders,
  trashQuizzes,
  onRefresh,
  onEditQuiz,
  onAssignQuiz,
  onLaunchLive,
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIsSubject, setNewFolderIsSubject] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingItem, setMovingItem] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [importing, setImporting] = useState(false);
  const { showToast } = useToast();

  const parseCsv = (text) => {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
        row = []; cell = '';
      } else cell += char;
    }
    row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
    if (!rows.length) throw new Error('The CSV file is empty.');
    const headers = rows.shift().map((value) => value.trim().toLowerCase());
    return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      let imported = [];
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(await file.text());
        imported = Array.isArray(parsed) ? parsed : parsed.quizzes;
        if (!Array.isArray(imported)) throw new Error('JSON must contain a quizzes array.');
      } else {
        const byTitle = new Map();
        parseCsv(await file.text()).forEach((row, rowIndex) => {
          const title = String(row.quiz_title || row.title || '').trim();
          const prompt = String(row.question || row.prompt || '').trim();
          if (!title || !prompt) throw new Error(`CSV row ${rowIndex + 2}: quiz_title and question are required.`);
          if (!byTitle.has(title)) byTitle.set(title, { title, subject: row.subject || 'General', description: row.description || '', draftQuestions: [] });
          const type = row.type || 'mcq';
          const options = type === 'tf' ? ['True', 'False'] : ['option_a', 'option_b', 'option_c', 'option_d'].map((key) => String(row[key] || '').trim()).filter(Boolean);
          const key = String(row.correct_option || '').trim();
          const correctAnswer = type === 'tf' ? /^true$/i.test(key) : Math.max(0, ['a', 'b', 'c', 'd'].indexOf(key.toLowerCase()));
          if (type !== 'short_answer' && (options.length < 2 || !['a', 'b', 'c', 'd'].includes(key.toLowerCase()))) throw new Error(`CSV row ${rowIndex + 2}: provide at least two options and correct_option a, b, c, or d.`);
          byTitle.get(title).draftQuestions.push({ id: `q_${crypto.randomUUID()}`, type, prompt, text: prompt, options, correctAnswer, acceptedAnswers: type === 'short_answer' ? [key] : [], explanation: row.explanation || '', points: 1 });
        });
        imported = [...byTitle.values()];
      }
      if (!imported.length || imported.length > 100) throw new Error('Import must include between 1 and 100 quizzes.');
      let count = 0;
      for (const quiz of imported) {
        if (!quiz || typeof quiz.title !== 'string' || !quiz.title.trim() || !Array.isArray(quiz.draftQuestions)) throw new Error('Each quiz needs a title and a draftQuestions array. Download the template for the supported format.');
        if (quiz.draftQuestions.length > 500) throw new Error(`Quiz "${quiz.title}" has over 500 questions.`);
        await api.post('/api/library/quizzes', { title: quiz.title.trim().slice(0, 160), subject: String(quiz.subject || 'General').slice(0, 80), description: String(quiz.description || '').slice(0, 2000), folderId: currentFolderId, settings: quiz.settings || { passMark: 50, shuffleOptions: false }, draftQuestions: quiz.draftQuestions });
        count += 1;
      }
      await onRefresh();
      showToast(`Imported ${count} quiz${count === 1 ? '' : 'zes'} into this folder.`);
    } catch (error) { showToast(error.message || 'Could not import the quiz file.', 'error'); }
    finally { setImporting(false); }
  };

  const download = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  };

  const exportQuizzes = (format) => {
    const list = visibleQuizzes;
    if (format === 'json') download('roster-quizzes.json', JSON.stringify({ version: 1, quizzes: list.map(({ id, createdAt, updatedAt, ...quiz }) => quiz) }, null, 2), 'application/json');
    else {
      const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = ['quiz_title,subject,question,type,option_a,option_b,option_c,option_d,correct_option,explanation'];
      list.forEach((quiz) => {
        (quiz.draftQuestions || []).forEach((q) => {
          const answer = q.type === 'tf'
            ? (q.correctAnswer === false ? 'false' : 'true')
            : q.type === 'short_answer'
              ? (q.acceptedAnswers || [q.correctAnswer])[0]
              : (['a', 'b', 'c', 'd'][Number(q.correctAnswer)] || q.correctAnswer);
          const cells = [quiz.title, quiz.subject, q.prompt || q.text, q.type || 'mcq', ...(q.options || []).slice(0, 4)];
          while (cells.length < 8) cells.push('');
          cells.push(answer, q.explanation || '');
          lines.push(cells.map(quote).join(','));
        });
      });
      download('roster-quizzes.csv', lines.join('\r\n'), 'text/csv;charset=utf-8');
    }
  };

  const breadcrumbs = useMemo(() => {
    const chain = [];
    let cursor = currentFolderId;
    const byId = new Map(folders.map((f) => [f.id, f]));
    while (cursor && byId.has(cursor)) {
      const f = byId.get(cursor);
      chain.unshift(f);
      cursor = f.parentId;
    }
    return chain;
  }, [folders, currentFolderId]);

  const visibleFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? folders.filter((f) => f.name.toLowerCase().includes(q))
      : folders.filter((f) => (f.parentId || null) === currentFolderId);

    return [...list].sort((a, b) =>
      sortBy === 'updated'
        ? new Date(b.updatedAt) - new Date(a.updatedAt)
        : a.name.localeCompare(b.name)
    );
  }, [folders, currentFolderId, search, sortBy]);

  const visibleQuizzes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? quizzes.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            (item.subject || '').toLowerCase().includes(q)
        )
      : quizzes.filter((item) => (item.folderId || null) === currentFolderId);

    return [...list].sort((a, b) =>
      sortBy === 'updated'
        ? new Date(b.updatedAt) - new Date(a.updatedAt)
        : a.title.localeCompare(b.title)
    );
  }, [quizzes, currentFolderId, search, sortBy]);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.post('/api/library/folders', {
        name: newFolderName.trim(),
        parentId: currentFolderId,
        isSubject: !currentFolderId && newFolderIsSubject,
      });
      setNewFolderName('');
      setShowNewFolder(false);
      showToast('Folder created.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateQuiz = async () => {
    const currentFolder = folders.find((f) => f.id === currentFolderId);
    try {
      const res = await api.post('/api/library/quizzes', {
        title: 'Untitled Quiz',
        subject: currentFolder ? currentFolder.name : 'General',
        folderId: currentFolderId,
        draftQuestions: [],
      });
      showToast('Created new quiz draft.');
      await onRefresh();
      onEditQuiz(res.quiz);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDuplicate = async (quiz) => {
    try {
      await api.post(`/api/library/quizzes/${quiz.id}/duplicate`, {});
      showToast(`Duplicated "${quiz.title}".`);
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSoftDeleteQuiz = async (quiz) => {
    try {
      await api.del(`/api/library/quizzes/${quiz.id}`);
      showToast(`Moved "${quiz.title}" to Trash.`, 'info');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSoftDeleteFolder = async (folder) => {
    try {
      await api.del(`/api/library/folders/${folder.id}`);
      if (currentFolderId === folder.id) setCurrentFolderId(folder.parentId || null);
      showToast(`Moved folder "${folder.name}" to Trash.`, 'info');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRestore = async (kind, id) => {
    try {
      await api.post(`/api/library/${kind}/${id}/restore`, {});
      showToast('Item restored from Trash.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePermanentDelete = async (kind, id) => {
    try {
      await api.del(`/api/library/${kind}/${id}?permanent=true`);
      showToast('Permanently deleted.', 'info');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!renamingFolder || !renamingFolder.name.trim()) return;
    try {
      await api.patch(`/api/library/folders/${renamingFolder.id}`, { name: renamingFolder.name.trim() });
      setRenamingFolder(null);
      showToast('Folder renamed.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleMoveSubmit = async (targetFolderId) => {
    if (!movingItem) return;
    try {
      if (movingItem.kind === 'quiz') {
        await api.patch(`/api/library/quizzes/${movingItem.id}`, { folderId: targetFolderId || null });
      } else {
        await api.patch(`/api/library/folders/${movingItem.id}`, { parentId: targetFolderId || null });
      }
      setMovingItem(null);
      showToast('Item moved.');
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const trashCount = trashFolders.length + trashQuizzes.length;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTrash(false)}
            className={!showTrash ? 'eval-btn-primary text-xs py-2' : 'eval-btn-secondary text-xs py-2'}
          >
            <Folder className="w-3.5 h-3.5" />
            Library
          </button>
          <button
            type="button"
            onClick={() => setShowTrash(true)}
            className={showTrash ? 'eval-btn-primary text-xs py-2' : 'eval-btn-secondary text-xs py-2'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Trash ({trashCount})
          </button>
        </div>

        {!showTrash && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="eval-btn-secondary text-xs py-2 cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing…' : 'Import Quiz'}
              <input type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" onChange={handleImport} disabled={importing} />
            </label>
            <button type="button" onClick={() => exportQuizzes('json')} className="eval-btn-secondary text-xs py-2" title="Export visible quizzes as JSON">
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
            <button type="button" onClick={() => exportQuizzes('csv')} className="eval-btn-secondary text-xs py-2" title="Export visible quiz questions as CSV">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--eval-muted)' }}>
              <a className="underline underline-offset-2" href="/templates/quiz-import-sample.json" download>JSON sample</a>
              <a className="underline underline-offset-2" href="/templates/quiz-import-sample.csv" download>CSV sample</a>
              <a className="underline underline-offset-2" href="/templates/quiz-import-format.md" download>Format guide</a>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--eval-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search library..."
                aria-label="Search library"
                className="eval-input pl-8 py-2 text-xs w-44 sm:w-56"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort library"
              className="eval-input py-2 text-xs w-auto"
            >
              <option value="name">Sort: Name</option>
              <option value="updated">Sort: Last Updated</option>
            </select>
            <button
              type="button"
              onClick={() => setShowNewFolder((v) => !v)}
              className="eval-btn-secondary text-xs py-2"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              {currentFolderId ? 'New Subfolder' : 'New Subject / Folder'}
            </button>
            <button
              type="button"
              onClick={handleCreateQuiz}
              className="eval-btn-primary text-xs py-2"
            >
              <Plus className="w-3.5 h-3.5" />
              New Quiz
            </button>
          </div>
        )}
      </div>

      {/* New Folder Inline Form */}
      {showNewFolder && !showTrash && (
        <form onSubmit={handleCreateFolder} className="eval-card p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="newFldName" className="block text-xs font-medium mb-1">
              {currentFolderId ? 'Subfolder Name' : 'Subject or Folder Name'}
            </label>
            <input
              id="newFldName"
              className="eval-input text-xs"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Data Structures"
              required
            />
          </div>
          {!currentFolderId && (
            <label className="inline-flex items-center gap-2 text-xs pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newFolderIsSubject}
                onChange={(e) => setNewFolderIsSubject(e.target.checked)}
              />
              Mark as Subject container
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" className="eval-btn-primary text-xs py-2">Create</button>
            <button type="button" onClick={() => setShowNewFolder(false)} className="eval-btn-secondary text-xs py-2">Cancel</button>
          </div>
        </form>
      )}

      {/* Breadcrumbs */}
      {!showTrash && !search && (
        <nav aria-label="Library breadcrumbs" className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className="eval-btn-ghost py-1 px-2 text-xs"
            style={!currentFolderId ? { color: 'var(--eval-ink)', fontWeight: 600 } : undefined}
          >
            <Home className="w-3.5 h-3.5" />
            All Subjects
          </button>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--eval-muted)' }} />
              <button
                type="button"
                onClick={() => setCurrentFolderId(crumb.id)}
                className="eval-btn-ghost py-1 px-2 text-xs"
                style={idx === breadcrumbs.length - 1 ? { color: 'var(--eval-ink)', fontWeight: 600 } : undefined}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
      )}

      {showTrash ? (
        <div className="eval-card divide-y" style={{ borderColor: 'var(--eval-border)' }}>
          {trashFolders.length === 0 && trashQuizzes.length === 0 ? (
            <div className="p-10 text-center text-xs" style={{ color: 'var(--eval-muted)' }}>
              Trash is empty. Soft-deleted folders and quizzes appear here so nothing is lost by mistake.
            </div>
          ) : (
            <>
              {trashFolders.map((f) => (
                <div key={f.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Folder className="w-4 h-4" style={{ color: 'var(--eval-muted)' }} />
                    <div>
                      <div className="text-sm font-medium">{f.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>Folder</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleRestore('folders', f.id)} className="eval-btn-secondary text-xs py-1.5 px-3">
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                    <button type="button" onClick={() => handlePermanentDelete('folders', f.id)} className="eval-btn-ghost text-xs py-1.5 px-3" style={{ color: 'var(--status-fail)' }}>
                      Delete Forever
                    </button>
                  </div>
                </div>
              ))}
              {trashQuizzes.map((q) => (
                <div key={q.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4" style={{ color: 'var(--eval-muted)' }} />
                    <div>
                      <div className="text-sm font-medium">{q.title}</div>
                      <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>
                        Quiz &middot; {q.subject} &middot; {(q.draftQuestions || []).length} questions
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleRestore('quizzes', q.id)} className="eval-btn-secondary text-xs py-1.5 px-3">
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                    <button type="button" onClick={() => handlePermanentDelete('quizzes', q.id)} className="eval-btn-ghost text-xs py-1.5 px-3" style={{ color: 'var(--status-fail)' }}>
                      Delete Forever
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Folders Grid */}
          {visibleFolders.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="eval-card eval-card-hover p-4 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setCurrentFolderId(folder.id); }}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--eval-accent-soft)', color: 'var(--eval-accent)' }}
                    >
                      <Folder className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{folder.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--eval-muted)' }}>
                        {folder.isSubject ? 'Subject' : 'Folder'}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRenamingFolder({ id: folder.id, name: folder.name })}
                      className="eval-btn-ghost p-1.5"
                      title="Rename folder"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovingItem({ kind: 'folder', id: folder.id, title: folder.name })}
                      className="eval-btn-ghost p-1.5"
                      title="Move folder"
                    >
                      <Move className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSoftDeleteFolder(folder)}
                      className="eval-btn-ghost p-1.5"
                      title="Move folder to Trash"
                      style={{ color: 'var(--status-fail)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quizzes List */}
          <div className="eval-card divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {visibleQuizzes.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-medium">No quizzes in this location yet</p>
                <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                  Create a new quiz or open a folder above.
                </p>
              </div>
            ) : (
              visibleQuizzes.map((quiz) => (
                <div key={quiz.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{quiz.title}</h3>
                      <span className="eval-badge eval-badge-brand">{quiz.subject || 'General'}</span>
                      <span className="eval-badge eval-badge-neutral font-mono">
                        {(quiz.draftQuestions || []).length} Qs
                      </span>
                    </div>
                    {quiz.description && (
                      <p className="text-xs truncate max-w-2xl" style={{ color: 'var(--eval-muted)' }}>
                        {quiz.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLaunchLive(quiz)}
                      className="eval-btn-primary text-xs py-1.5 px-3"
                    >
                      <Radio className="w-3.5 h-3.5" /> Live Room
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignQuiz(quiz)}
                      className="eval-btn-secondary text-xs py-1.5 px-3"
                    >
                      <Send className="w-3.5 h-3.5" /> Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditQuiz(quiz)}
                      className="eval-btn-secondary text-xs py-1.5 px-3"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(quiz)}
                      className="eval-btn-ghost p-1.5"
                      title="Duplicate quiz"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovingItem({ kind: 'quiz', id: quiz.id, title: quiz.title })}
                      className="eval-btn-ghost p-1.5"
                      title="Move quiz"
                    >
                      <Move className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSoftDeleteQuiz(quiz)}
                      className="eval-btn-ghost p-1.5"
                      title="Move quiz to Trash"
                      style={{ color: 'var(--status-fail)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {renamingFolder && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={handleRenameSubmit} className="eval-card p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold">Rename Folder</h3>
            <input
              className="eval-input"
              value={renamingFolder.name}
              onChange={(e) => setRenamingFolder({ ...renamingFolder, name: e.target.value })}
              required
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRenamingFolder(null)} className="eval-btn-secondary text-xs">Cancel</button>
              <button type="submit" className="eval-btn-primary text-xs">Save</button>
            </div>
          </form>
        </div>
      )}

      {/* Move Modal */}
      {movingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="eval-card p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold">Move &ldquo;{movingItem.title}&rdquo;</h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => handleMoveSubmit(null)}
                className="w-full text-left px-3 py-2 rounded-lg border text-xs hover:bg-[var(--eval-surface-muted)]"
                style={{ borderColor: 'var(--eval-border)' }}
              >
                Root (All Subjects)
              </button>
              {folders
                .filter((f) => f.id !== movingItem.id)
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => handleMoveSubmit(f.id)}
                    className="w-full text-left px-3 py-2 rounded-lg border text-xs hover:bg-[var(--eval-surface-muted)] flex items-center gap-2"
                    style={{ borderColor: 'var(--eval-border)' }}
                  >
                    <Folder className="w-3.5 h-3.5" style={{ color: 'var(--eval-accent)' }} />
                    {f.name}
                  </button>
                ))}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setMovingItem(null)} className="eval-btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
