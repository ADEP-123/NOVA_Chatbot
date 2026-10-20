import ReactMarkdown from 'react-markdown';

const mdComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <details className="sources">
      <summary>Fuentes consultadas ({sources.length})</summary>
      <ol>
        {sources.map((s, i) => (
          <li key={i}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            ) : (
              s.title
            )}
            {s.statusLegal && !s.statusLegal.startsWith('vigente') && <span className="badge">{s.statusLegal}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function Message({ message }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="bubble">{message.content}</div>
      </div>
    );
  }
  return (
    <div className="msg msg-bot">
      <span className="avatar" aria-hidden="true">
        N
      </span>
      <div className="bot-body">
        {message.content ? (
          <div className="markdown">
            <ReactMarkdown components={mdComponents}>{message.content}</ReactMarkdown>
          </div>
        ) : (
          !message.error && (
            <p className="typing" aria-label="NOVA está escribiendo">
              <span />
              <span />
              <span />
            </p>
          )
        )}
        {message.error && (
          <p className="alert alert-error" role="alert">
            {message.error}
          </p>
        )}
        {!message.streaming && <Sources sources={message.sources} />}
      </div>
    </div>
  );
}
