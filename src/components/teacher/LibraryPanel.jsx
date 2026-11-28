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
  ChevronDown,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../Toast';
import ActionMenu from '../ActionMenu';

export default function LibraryPanel({
  folders,
  quizzes,
  trashFolders,
  trashQuizzes,
  onRefresh,
  onEditQuiz,
  onAssignQuiz,
  onLaunchLive,
  view = 'library',
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const showTrash = view === 'trash';
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIsSubject, setNewFolderIsSubject] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingItem, setMovingItem] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [folderPaths, setFolderPaths] = useState('');
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
    const seen = new Set();
    while (cursor && byId.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
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
      if (movingItem.kind === 'folder' && targetFolderId) {
        const descendants = new Set([movingItem.id]);
        let grew = true;
        while (grew) {
          grew = false;
          folders.forEach((folder) => {
            if (descendants.has(folder.parentId) && !descendants.has(folder.id)) {
              descendants.add(folder.id);
              grew = true;
            }
          });
        }
        if (descendants.has(targetFolderId)) throw new Error('A folder cannot be moved inside itself or one of its subfolders.');
      }
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

  const renderFolderTree = (folder, depth = 0) => {
    const children = folders.filter((item) => item.parentId === folder.id);
    const files = quizzes.filter((item) => item.folderId === folder.id);
    const expanded = expandedFolders.has(folder.id);
    return <React.Fragment key={`tree-${folder.id}`}><div className="flex items-center gap-1 py-1" style={{paddingLeft:`${depth * 16}px`}}><button type="button" onClick={()=>setExpandedFolders(old=>{const next=new Set(old);next.has(folder.id)?next.delete(folder.id):next.add(folder.id);return next})} aria-label={`${expanded?'Collapse':'Expand'} ${folder.name}`} className="p-1"><ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded?'rotate-90':''}`}/></button><Folder className="h-3.5 w-3.5"/><button type="button" onClick={()=>{setSearch('');setCurrentFolderId(folder.id)}} className="min-w-0 truncate text-left text-xs hover:underline">{folder.name}</button><span className="ml-auto pr-2 text-[10px]" style={{color:'var(--eval-muted)'}}>{children.length+files.length} items</span></div>{expanded&&<>{children.map((child)=>renderFolderTree(child,depth+1))}{files.map((quiz)=><button key={`tree-q-${quiz.id}`} type="button" onClick={()=>onEditQuiz(quiz)} className="flex w-full items-center gap-2 py-1 text-left text-xs" style={{paddingLeft:`${(depth+1)*16+24}px`}}><FileText className="h-3.5 w-3.5"/>{quiz.title}</button>)}</>}</React.Fragment>;
  };

  const handleFolderFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const content = await file.text();
      let paths;
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(content);
        const foldersInFile = Array.isArray(parsed) ? parsed : parsed.folders;
        if (!Array.isArray(foldersInFile)) throw new Error('JSON needs a folders array.');
        paths = foldersInFile.map((item) => typeof item === 'string' ? item : item.path || [item.parentPath, item.name].filter(Boolean).join('/'));
      } else paths = parseCsv(content).map((row) => row.path || row.folder_path || row.folder || row.name).filter(Boolean);
      if (!paths.length) throw new Error('No folder paths were found in that file.');
      setFolderPaths(paths.join('\n'));
    } catch (error) { showToast(error.message || 'Could not read folder structure.', 'error'); }
  };

  return (
    <div className="space-y-5">
      {/* Compact, grouped library controls */}
      <div className="eval-card p-2 sm:p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{showTrash ? 'Trash' : 'Library'}</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--eval-muted)' }}>
              {showTrash ? 'Restore removed items or permanently delete them.' : 'Create, organize, import, and export assessments.'}
            </p>
          </div>
          {showTrash && <span className="text-xs" style={{color:'var(--eval-muted)'}}>{trashCount} items</span>}
        </div>

        {!showTrash && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--eval-muted)' }} />
                <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search library…" aria-label="Search library" className="eval-input w-full pl-8 py-2 text-xs" />
              </div>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort library" className="eval-input py-2 text-xs lg:w-48">
                <option value="name">Sort: Name</option>
                <option value="updated">Sort: Last Updated</option>
              </select>
              <div className="relative">
                <button type="button" onClick={() => setShowActions((v) => !v)} className="eval-btn-primary py-2 text-xs" aria-expanded={showActions}><Plus className="h-3.5 w-3.5"/> Library actions <ChevronDown className="h-3.5 w-3.5"/></button>
                {showActions && <div className="absolute right-0 top-full z-20 mt-1 w-52 py-1 bg-[var(--eval-bg)] border-y border-[var(--eval-border)]">
                  <button type="button" onClick={() => { setShowActions(false); handleCreateQuiz(); }} className="w-full px-3 py-2 text-left text-xs hover:text-[var(--eval-accent)]"><Plus className="mr-2 inline h-3.5 w-3.5"/>New quiz</button>
                  <button type="button" onClick={() => { setShowActions(false); setImporting(true); }} className="w-full px-3 py-2 text-left text-xs hover:text-[var(--eval-accent)]"><Upload className="mr-2 inline h-3.5 w-3.5"/>Import quiz</button>
                  <button type="button" onClick={() => { setShowActions(false); exportQuizzes('json'); }} className="w-full px-3 py-2 text-left text-xs"><Download className="mr-2 inline h-3.5 w-3.5"/>Export JSON</button>
                  <button type="button" onClick={() => { setShowActions(false); exportQuizzes('csv'); }} className="w-full px-3 py-2 text-left text-xs"><Download className="mr-2 inline h-3.5 w-3.5"/>Export CSV</button>
                  <button type="button" onClick={() => { setShowActions(false); setFolderPaths(''); setShowNewFolder(true); }} className="w-full px-3 py-2 text-left text-xs"><FolderPlus className="mr-2 inline h-3.5 w-3.5"/>{currentFolderId ? 'New subfolder' : 'New subject / folder'}</button>
                </div>}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px]" style={{color:'var(--eval-muted)'}}><span>Templates:</span><a className="underline" href="/templates/quiz-import-sample.json" download>JSON sample</a><a className="underline" href="/templates/quiz-import-sample.csv" download>CSV sample</a><a className="underline" href="/templates/quiz-import-format.md" download>Format guide</a></div>
          </>
        )}
      </div>

      {importing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={(e)=>{if(e.target===e.currentTarget)setImporting(false)}}><div className="w-full max-w-lg bg-[var(--eval-bg)] p-5" role="dialog" aria-modal="true" aria-labelledby="quiz-import-title"><div className="flex justify-between"><div><h3 id="quiz-import-title" className="font-semibold">Import quizzes</h3><p className="mt-1 text-xs" style={{color:'var(--eval-muted)'}}>Choose a JSON or CSV quiz file. It will be added to the current folder.</p></div><button type="button" onClick={()=>setImporting(false)} aria-label="Close">×</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><label className="eval-btn-secondary cursor-pointer justify-center text-xs"><Upload className="h-4 w-4"/> Import JSON<input type="file" accept=".json,application/json" className="sr-only" onChange={handleImport}/></label><label className="eval-btn-secondary cursor-pointer justify-center text-xs"><Upload className="h-4 w-4"/> Import CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleImport}/></label></div><p className="mt-4 text-xs" style={{color:'var(--eval-muted)'}}>Not sure about the required format? Download a sample JSON or CSV file, or read the format guide before importing.</p><div className="mt-2 flex gap-4 text-xs"><a className="underline" href="/templates/quiz-import-sample.json" download>Sample JSON</a><a className="underline" href="/templates/quiz-import-sample.csv" download>Sample CSV</a><a className="underline" href="/templates/quiz-import-format.md" download>Format guide</a></div></div></div>}

      {/* New Folder Inline Form */}
      {showNewFolder && !showTrash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"><form onSubmit={async(e)=>{e.preventDefault(); try { const paths=folderPaths.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(!paths.length) throw new Error('Enter at least one folder path.'); for(const path of paths){ let parentId=currentFolderId; for(const part of path.split('/').map(x=>x.trim()).filter(Boolean)){ let existing=folders.find(f=>f.name.toLowerCase()===part.toLowerCase()&&(f.parentId||null)===parentId); if(!existing){ const res=await api.post('/api/library/folders',{name:part,parentId,isSubject:!parentId&&newFolderIsSubject}); existing=res.folder||res; } parentId=existing.id; }} setFolderPaths('');setShowNewFolder(false);await onRefresh();showToast('Folder structure created.'); } catch(err){showToast(err.message||'Could not create folders.','error')} }} className="w-full max-w-lg bg-[var(--eval-bg)] p-5 space-y-3" role="dialog" aria-modal="true">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="newFldName" className="block text-xs font-medium mb-1">
              {currentFolderId ? 'Subfolder Name' : 'Subject or Folder Name'}
            </label>
            <textarea
              id="newFldName"
              className="eval-input min-h-28 text-xs"
              placeholder="e.g. Data Structures / Week 1 / Practice"
              value={folderPaths}
              onChange={(e)=>setFolderPaths(e.target.value)}
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
          <div className="flex flex-wrap items-center gap-3 text-xs"><label className="eval-btn-secondary cursor-pointer py-1.5 text-xs"><Upload className="h-3.5 w-3.5"/>Load CSV / JSON structure<input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={handleFolderFile}/></label><a className="underline" href="/templates/quiz-import-sample.json" download>JSON example</a><a className="underline" href="/templates/quiz-import-sample.csv" download>CSV example</a></div>
          <p className="text-xs" style={{color:'var(--eval-muted)'}}>Enter one folder path per line. Use / to create nested folders. JSON structure files can include a folders array; CSV files should include a path column.</p>
          <div className="flex gap-2">
            <button type="submit" className="eval-btn-primary text-xs py-2">Create folders</button>
            <button type="button" onClick={() => setShowNewFolder(false)} className="eval-btn-secondary text-xs py-2">Cancel</button>
          </div>
        </form></div>
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
          {currentFolderId && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{breadcrumbs.at(-1)?.name || 'Folder'}</h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--eval-muted)' }}>Quizzes and subfolders in this location.</p>
              </div>
              <button type="button" onClick={() => { setFolderPaths(''); setShowNewFolder(true); }} className="eval-btn-secondary py-2 text-xs"><FolderPlus className="h-3.5 w-3.5"/>New subfolder</button>
            </div>
          )}
          <div className="eval-card overflow-hidden divide-y" style={{ borderColor: 'var(--eval-border)' }}>
            {visibleFolders.length === 0 && visibleQuizzes.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-medium">{search ? 'No matching items' : 'This folder is empty'}</p>
                <p className="text-xs" style={{ color: 'var(--eval-muted)' }}>
                  Create a quiz or folder here, or move existing items into this location.
                </p>
              </div>
            ) : (
              <>
            {visibleFolders.map((folder) => {
                  const contents = folders.filter((item) => item.parentId === folder.id).length + quizzes.filter((item) => item.folderId === folder.id).length;
                  return <React.Fragment key={`folder-${folder.id}`}><div className="group flex flex-wrap items-center gap-2 px-3 py-2 transition-colors">
                    <button type="button" aria-label={`${expandedFolders.has(folder.id)?'Collapse':'Expand'} ${folder.name}`} onClick={() => setExpandedFolders(old=>{const next=new Set(old); next.has(folder.id)?next.delete(folder.id):next.add(folder.id); return next})} className="p-1"><ChevronRight className={`h-4 w-4 transition-transform ${expandedFolders.has(folder.id)?'rotate-90':''}`} style={{color:'var(--eval-muted)'}}/></button>
                    <button type="button" onClick={() => { setSearch(''); setCurrentFolderId(folder.id); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <Folder className="h-5 w-5 shrink-0" style={{ color: 'var(--eval-accent)' }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
                      <span className="hidden text-[11px] sm:inline" style={{ color: 'var(--eval-muted)' }}>{contents} items</span>
                      <span className="eval-badge eval-badge-neutral text-[10px]">{folder.isSubject ? 'Subject' : 'Folder'}</span>
                    </button>
                    <ActionMenu label={`More options for ${folder.name}`} items={[
                      {label:'Rename',icon:Edit3,onSelect:()=>setRenamingFolder({id:folder.id,name:folder.name})},
                      {label:'Move',icon:Move,onSelect:()=>setMovingItem({kind:'folder',id:folder.id,title:folder.name})},
                      {label:'Move to Trash',icon:Trash2,danger:true,onSelect:()=>handleSoftDeleteFolder(folder)},
                    ]}/>
                    {/* legacy actions replaced by the compact menu */}<div className="hidden">
                      <button type="button" onClick={() => setRenamingFolder({ id: folder.id, name: folder.name })} className="eval-btn-ghost p-1.5" title="Rename folder"><Edit3 className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setMovingItem({ kind: 'folder', id: folder.id, title: folder.name })} className="eval-btn-ghost p-1.5" title="Move folder"><Move className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => handleSoftDeleteFolder(folder)} className="eval-btn-ghost p-1.5" title="Move folder to Trash" style={{ color: 'var(--status-fail)' }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div></div>
                    {expandedFolders.has(folder.id) && <div className="ml-8 border-l border-[var(--eval-border)]">{folders.filter(f=>f.parentId===folder.id).map(child=>renderFolderTree(child,0))}{quizzes.filter(q=>q.folderId===folder.id).map(q=><button key={q.id} type="button" onClick={()=>onEditQuiz(q)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs"><FileText className="h-3.5 w-3.5"/>{q.title}</button>)}</div>}
                  </React.Fragment>
                })}
                {visibleQuizzes.map((quiz) => (
                  <div key={`quiz-${quiz.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--eval-bg)]">
                    <FileText className="h-5 w-5 shrink-0" style={{ color: 'var(--eval-muted)' }} />
                    <button type="button" onClick={() => onEditQuiz(quiz)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium">{quiz.title}</span>
                      <span className="block truncate text-[11px]" style={{ color: 'var(--eval-muted)' }}>{quiz.subject || 'General'} · {(quiz.draftQuestions || []).length} questions{quiz.description ? ` · ${quiz.description}` : ''}</span>
                    </button>
                    <ActionMenu label={`More actions for ${quiz.title}`} items={[
                      {label:'Start live room',icon:Radio,onSelect:()=>onLaunchLive(quiz)},
                      {label:'Assign quiz',icon:Send,onSelect:()=>onAssignQuiz(quiz)},
                      {label:'Duplicate',icon:Copy,onSelect:()=>handleDuplicate(quiz)},
                      {label:'Move to folder',icon:Move,onSelect:()=>setMovingItem({kind:'quiz',id:quiz.id,title:quiz.title})},
                      {label:'Move to Trash',icon:Trash2,danger:true,onSelect:()=>handleSoftDeleteQuiz(quiz)},
                    ]}/>
                  </div>
                ))}
              </>
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
                .filter((f) => {
                  if (movingItem.kind !== 'folder') return true;
                  const descendants = new Set([movingItem.id]);
                  let grew = true;
                  while (grew) {
                    grew = false;
                    folders.forEach((folder) => {
                      if (descendants.has(folder.parentId) && !descendants.has(folder.id)) { descendants.add(folder.id); grew = true; }
                    });
                  }
                  return !descendants.has(f.id);
                })
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
