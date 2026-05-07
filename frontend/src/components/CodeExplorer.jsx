/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Code2, Copy, FileCode2, FolderTree, Search, ShieldAlert } from 'lucide-react';

const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const buildCodeLines = (content = '') => content.split('\n').map((line, index) => ({
  number: index + 1,
  text: line
}));

export default function CodeExplorer({ analysis }) {
  const [files, setFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('code');
  const [error, setError] = useState('');

  useEffect(() => {
    const nextFiles = analysis?.codeFiles || [];
    setFiles(nextFiles);
    setSelectedPath(nextFiles.find((file) => file.role === 'entry')?.path || nextFiles[0]?.path || '');
    setError('');
  }, [analysis]);

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files;
    return files.filter((file) => file.path.toLowerCase().includes(needle) || file.explanation?.toLowerCase().includes(needle));
  }, [files, query]);

  const selectedMeta = files.find((file) => file.path === selectedPath);
  const selectedContent = analysis?.fileContents?.[selectedPath]?.content || '';
  const selectedFindings = (analysis?.vulnerabilities || []).filter((finding) => finding.filePath === selectedPath);
  const explanation = selectedMeta ? {
    explanation: selectedMeta.explanation || `${selectedMeta.path} is part of the scanned repository.`,
    vulnerabilities: selectedFindings
  } : null;
  const codeLines = buildCodeLines(selectedContent);

  const copyContent = async () => {
    const text = mode === 'code' ? selectedContent : explanation?.explanation;
    if (!text) return;
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="code-explorer glass-panel">
      <div className="panel-header code-explorer-header">
        <div className="panel-title-row">
          <FileCode2 size={22} />
          <div>
            <div>Repository Code Explorer</div>
            <span>Browse implementation or switch to simplified English</span>
          </div>
        </div>
        <div className="segmented-control">
          <button className={mode === 'code' ? 'active' : ''} onClick={() => setMode('code')}>
            <Code2 size={15} /> Code
          </button>
          <button className={mode === 'explain' ? 'active' : ''} onClick={() => setMode('explain')}>
            <BookOpen size={15} /> Explain
          </button>
        </div>
      </div>

      {error && <div className="inline-alert"><ShieldAlert size={16} /> {error}</div>}

      {!analysis ? (
        <div className="center-state">
          <FileCode2 size={52} className="empty-icon" />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>No repository code loaded</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '560px' }}>
              Run Repo X-Ray with a GitHub URL first. This explorer will show code only from that scanned repository.
            </p>
          </div>
        </div>
      ) : (
      <div className="code-explorer-layout">
        <aside className="file-browser">
          <div className="file-browser-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files or purpose" />
          </div>

          <div className="file-browser-meta">
            <FolderTree size={15} />
            <span>{visibleFiles.length} of {files.length} files</span>
          </div>

          <div className="file-list">
            {visibleFiles.map((file) => (
              <button
                key={file.path}
                className={`file-row ${selectedPath === file.path ? 'active' : ''}`}
                onClick={() => setSelectedPath(file.path)}
              >
                <span>{file.path}</span>
                <small>{file.language} | {file.lines} lines</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="code-viewer">
          <div className="code-toolbar">
            <div>
              <strong>{selectedPath || 'No file selected'}</strong>
              {selectedMeta && <span>{selectedMeta.language} | {selectedMeta.lines} lines | {formatBytes(selectedMeta.size)}</span>}
            </div>
            <button className="btn-ghost-small" onClick={copyContent} title="Copy current content">
              <Copy size={15} />
            </button>
          </div>

          {mode === 'code' ? (
            <pre className="source-code">
              {selectedContent ? codeLines.map((line) => (
                <div className="source-line" key={line.number}>
                  <span>{line.number}</span>
                  <code>{line.text || ' '}</code>
                </div>
              )) : (
                <div className="center-state">
                  <p>Source content was not included for this file, usually because it is too large or not a supported text file.</p>
                </div>
              )}
            </pre>
          ) : (
            <div className="explanation-view">
              {(explanation?.explanation || 'Select a file to see its explanation.').split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}

              {explanation?.vulnerabilities?.length > 0 && (
                <section>
                  <h4>Security Findings In This File</h4>
                  {explanation.vulnerabilities.map((finding) => (
                    <div className="finding-row" key={`${finding.id}-${finding.line}`}>
                      <strong>{finding.severity.toUpperCase()} {finding.id}</strong>
                      <span>Line {finding.line}: {finding.message}</span>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
