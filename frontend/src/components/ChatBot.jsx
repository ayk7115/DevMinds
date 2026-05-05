import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader } from 'lucide-react';

const CHAT_SESSION_KEY = 'devmind.chat.session.v1';

const welcomeMessage = {
  role: 'assistant',
  text: "Hey! I'm DevMind AI\n\nI can answer questions about your PR history, deployment scores, and code activity. Try asking:\n\n- \"What was the latest PR score?\"\n- \"Were there any security risks this week?\"\n- \"Summarize this week's changes\""
};

const loadChatMessages = () => {
  try {
    const storedMessages = JSON.parse(localStorage.getItem(CHAT_SESSION_KEY) || '[]');
    return Array.isArray(storedMessages) && storedMessages.length > 0 ? storedMessages : [welcomeMessage];
  } catch {
    return [welcomeMessage];
  }
};

export default function ChatBot() {
  const [messages, setMessages] = useState(loadChatMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(messages.slice(-80)));
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error || 'No response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Could not reach the chat service. Make sure the backend is running.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel chat-panel" style={{ height: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <Bot size={20} />
        DevMind AI Chat
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--success)', background: 'rgba(16,185,129,0.1)', padding: '0.2rem 0.6rem', borderRadius: '20px' }}>
          Groq - llama3-8b
        </span>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            <div className="chat-avatar">
              {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
            </div>
            <div className="chat-text">{msg.text}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble assistant">
            <div className="chat-avatar"><Bot size={14} /></div>
            <div className="chat-text chat-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask about your PRs..."
          disabled={loading}
        />
        <button className="chat-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? <Loader size={16} className="spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
