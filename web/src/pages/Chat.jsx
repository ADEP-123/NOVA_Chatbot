import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { streamChat } from '../chatStream.js';
import Message from '../components/Message.jsx';

const SUGGESTIONS = [
  '¿Quién está obligado a declarar renta en 2026?',
  '¿Qué es el Régimen Simple de Tributación y quién puede inscribirse?',
  '¿Cuál es la tarifa general del IVA?',
  '¿Cuánto tiempo debo conservar las facturas y soportes contables?',
];

function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, open }) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Historial de consultas">
      <button type="button" className="btn btn-primary new-chat" onClick={onNew}>
        + Nueva consulta
      </button>
      <ul className="conv-list">
        {conversations.map((c) => (
          <li key={c.id} className={c.id === activeId ? 'active' : ''}>
            <button type="button" className="conv-title" onClick={() => onSelect(c.id)} title={c.title}>
              {c.title}
            </button>
            <button type="button" className="conv-del" onClick={() => onDelete(c.id)} aria-label={`Eliminar "${c.title}"`} title="Eliminar">
              ×
            </button>
          </li>
        ))}
        {!conversations.length && <li className="muted small empty">Aún no tienes consultas guardadas.</li>}
      </ul>
    </aside>
  );
}

export default function Chat() {
  const { user, loading } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  const loadConversations = useCallback(async () => {
    if (!user) return setConversations([]);
    setConversations((await api('/chat/conversations')).conversations);
  }, [user]);

  useEffect(() => {
    loadConversations().catch(() => {});
    setActiveId(null);
    setMessages([]);
  }, [loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const updateLast = (fn) => setMessages((list) => (list.length ? [...list.slice(0, -1), fn(list.at(-1))] : list));

  async function send(text) {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    const history = messages.filter((m) => m.content && !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((list) => [...list, { role: 'user', content: question }, { role: 'assistant', content: '', streaming: true }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(user ? { message: question, conversationId: activeId } : { message: question, history }, {
        signal: controller.signal,
        onMeta: ({ conversationId, sources }) => {
          if (conversationId && conversationId !== activeId) setActiveId(conversationId);
          updateLast((m) => ({ ...m, sources }));
        },
        onToken: (t) => updateLast((m) => ({ ...m, content: m.content + t })),
      });
    } catch (err) {
      if (err.name !== 'AbortError') updateLast((m) => ({ ...m, error: err.message }));
    } finally {
      updateLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
      abortRef.current = null;
      loadConversations().catch(() => {});
    }
  }

  async function openConversation(id) {
    setSidebarOpen(false);
    abortRef.current?.abort();
    const data = await api(`/chat/conversations/${id}`);
    setActiveId(id);
    setMessages(data.messages);
  }

  async function deleteConversation(id) {
    if (!window.confirm('¿Eliminar esta consulta del historial?')) return;
    await api(`/chat/conversations/${id}`, { method: 'DELETE' });
    if (id === activeId) newChat();
    loadConversations();
  }

  function newChat() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  if (loading) return null;

  return (
    <div className={`chat-layout ${user ? 'with-sidebar' : ''}`}>
      {user && (
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={openConversation}
          onNew={newChat}
          onDelete={deleteConversation}
          open={sidebarOpen}
        />
      )}
      <section className="chat-main">
        {user && (
          <div className="chat-toolbar">
            <button type="button" className="btn btn-ghost" onClick={() => setSidebarOpen((o) => !o)} aria-expanded={sidebarOpen}>
              Historial
            </button>
            <button type="button" className="btn btn-ghost" onClick={newChat}>
              Nueva
            </button>
          </div>
        )}
        {!user && (
          <p className="anon-banner">
            Estás consultando sin cuenta: tu conversación no se guarda. <Link to="/login">Inicia sesión</Link> o{' '}
            <Link to="/registro">crea una cuenta</Link> para conservar tu historial.
          </p>
        )}
        <div className="messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome">
              <h1>Hola, soy NOVA</h1>
              <p>Resuelvo preguntas sobre la normativa tributaria vigente en Colombia y te digo de qué norma sale cada respuesta.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button type="button" key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <Message key={m.id ?? i} message={m} />)
          )}
          <div ref={endRef} />
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="composer-box">
            <label htmlFor="question" className="sr-only">
              Escribe tu pregunta
            </label>
            <textarea
              id="question"
              rows={1}
              value={input}
              maxLength={2000}
              placeholder="Escribe tu pregunta tributaria…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {busy ? (
              <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
                Detener
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
                Enviar
              </button>
            )}
          </div>
          <p className="disclaimer">NOVA es un asistente de IA y puede equivocarse. Su orientación no reemplaza la asesoría de un contador o abogado.</p>
        </form>
      </section>
    </div>
  );
}
