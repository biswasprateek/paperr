import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useMode } from '../hooks/useMode';
import { DotIcon } from './Logo';
import { renderMarkdown } from '../utils/markdown.jsx';

const GREETING = { role: 'assistant', content: "Hi! I'm dotAi! How can I help you today?" };

function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Message({ msg, canRegenerate, onRegenerate, onNavigate, regenerating }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const variantCount = msg.variants?.length || 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`group relative max-w-[80%] ${isUser ? 'flex items-end gap-1.5' : ''}`}>
        {isUser && (
          <button
            onClick={handleCopy}
            title="Copy message"
            className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 p-1 rounded-full hover:bg-surface-container text-on-surface-variant flex-shrink-0 mb-1"
          >
            <span className="material-symbols-outlined text-[14px]">
              {copied ? 'check' : 'content_copy'}
            </span>
          </button>
        )}
        <div
          className={`p-4 rounded-2xl text-body-md font-light tracking-wide ${
            isUser
              ? 'bg-primary/10 text-on-surface rounded-tr-sm'
              : 'bg-surface text-on-surface rounded-tl-sm shadow-sm border border-outline-variant/15'
          }`}
        >
          {isUser ? msg.content : renderMarkdown(msg.content)}
        </div>
      </div>
      {msg.diffCards?.length > 0 && (
        <div className="mt-2 space-y-1 max-w-[80%]">
          {msg.diffCards.map((card, i) => (
            <div key={i} className="flex items-center gap-2 bg-primary/5 border border-outline-variant/20 rounded-lg px-3 py-2 text-label-md text-on-surface">
              <span className="material-symbols-outlined text-primary text-[14px] flex-shrink-0">check_circle</span>
              {card}
            </div>
          ))}
        </div>
      )}
      {!isUser && canRegenerate && (
        <div className="flex items-center gap-0.5 mt-1 pl-1">
          {variantCount > 1 && (
            <>
              <button
                onClick={() => onNavigate(-1)}
                disabled={msg.variantIndex === 0}
                title="Previous response"
                className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant disabled:opacity-30 transition-colors duration-150"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_left</span>
              </button>
              <span className="text-label-xs text-on-surface-variant tabular-nums">
                {msg.variantIndex + 1}/{variantCount}
              </span>
              <button
                onClick={() => onNavigate(1)}
                disabled={msg.variantIndex === variantCount - 1}
                title="Next response"
                className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant disabled:opacity-30 transition-colors duration-150"
              >
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              </button>
            </>
          )}
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            title="Regenerate response"
            className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant disabled:opacity-30 transition-colors duration-150"
          >
            <span className={`material-symbols-outlined text-[14px] ${regenerating ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      )}
    </div>
  );
}

function TaskWithSubtasksPreview({ args }) {
  const PRIORITY_COLOR = { high: 'text-error', low: 'text-on-surface-variant', medium: 'text-on-surface-variant' };
  const PRIORITY_ICON  = { high: 'keyboard_double_arrow_up', medium: 'drag_handle', low: 'keyboard_double_arrow_down' };

  return (
    <div className="bg-surface-container rounded-xl overflow-hidden">
      {/* Parent task row */}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="material-symbols-outlined text-primary text-[15px] mt-0.5 flex-shrink-0">task_alt</span>
        <div className="flex-1 min-w-0">
          <p className="text-body-md text-on-surface font-medium leading-snug">{args.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {args.dueDate && (
              <span className="flex items-center gap-1 text-label-xs text-on-surface-variant">
                <span className="material-symbols-outlined text-[11px]">calendar_today</span>
                {args.dueDate}
              </span>
            )}
            {args.priority && args.priority !== 'medium' && (
              <span className={`flex items-center gap-0.5 text-label-xs ${PRIORITY_COLOR[args.priority] || ''}`}>
                <span className="material-symbols-outlined text-[11px]">{PRIORITY_ICON[args.priority]}</span>
                {args.priority}
              </span>
            )}
            {args.listId && (
              <span className="text-label-xs text-on-surface-variant">list #{args.listId}</span>
            )}
          </div>
        </div>
        <span className="text-label-xs text-on-surface-variant bg-surface px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5">
          {args.subtasks?.length || 0} subtasks
        </span>
      </div>

      {/* Subtasks */}
      {args.subtasks?.length > 0 && (
        <div className="border-t border-outline-variant/10 px-3 py-2 space-y-1.5">
          {args.subtasks.map((sub, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-outline-variant/50 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-body-sm text-on-surface-variant leading-snug">{sub.title}</p>
                {(sub.dueDate || sub.priority) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {sub.dueDate && (
                      <span className="text-label-xs text-on-surface-variant/70">{sub.dueDate}</span>
                    )}
                    {sub.priority && sub.priority !== 'medium' && (
                      <span className={`text-label-xs ${PRIORITY_COLOR[sub.priority] || ''}`}>{sub.priority}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmationCard({ toolCalls, onApprove, onDeny, loading }) {
  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[88%] bg-surface rounded-2xl rounded-tl-sm shadow-sm border border-outline-variant/15 overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-[16px]">edit_note</span>
            <p className="text-label-md text-on-surface-variant font-medium">dotAi wants to make these changes:</p>
          </div>
          <div className="space-y-2">
            {toolCalls.map((tc, i) =>
              tc.name === 'createTask' && tc.args?.subtasks?.length ? (
                <TaskWithSubtasksPreview key={i} args={tc.args} />
              ) : (
                <div key={i} className="flex items-start gap-2 bg-surface-container rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-primary text-[14px] mt-0.5 flex-shrink-0">arrow_forward</span>
                  <p className="text-body-md text-on-surface">{tc.summary}</p>
                </div>
              )
            )}
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-outline-variant/10">
          <button
            onClick={onDeny}
            disabled={loading}
            className="flex-1 py-2 rounded-full border border-outline-variant/30 text-label-md text-on-surface-variant hover:bg-surface-container transition-colors duration-150 disabled:opacity-40"
          >
            Deny
          </button>
          <button
            onClick={onApprove}
            disabled={loading}
            className="flex-1 py-2 rounded-full bg-primary text-on-primary text-label-md hover:opacity-90 transition-opacity duration-150 disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {loading
              ? <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
              : <span className="material-symbols-outlined text-[14px]">check</span>
            }
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatDrawer() {
  const { chatOpen, setChatOpen } = useUiStore();
  const { user } = useAuthStore();
  const { mode } = useMode();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // { toolCalls, assistantMessage, forMessages, regenerateIndex? } — pending confirmation
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);

  const bottomRef = useRef(null);
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    const handler = () => setChatOpen(true);
    document.addEventListener('toggle-chat', handler);
    return () => document.removeEventListener('toggle-chat', handler);
  }, [setChatOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingConfirmation]);

  const saveSession = useCallback(async (msgs, sid) => {
    if (!msgs.some(m => m.role === 'user')) return sid;
    const firstUser = msgs.find(m => m.role === 'user')?.content || 'Chat';
    const title = firstUser.length > 45 ? firstUser.slice(0, 45) + '…' : firstUser;
    try {
      const { data } = await api.post('/chat/sessions', {
        ...(sid ? { id: sid } : {}),
        title,
        messages: msgs,
      });
      return data.id;
    } catch {
      return sid;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/chat/sessions');
      setSessions(data);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = () => {
    setHistoryOpen(true);
    loadHistory();
  };

  const startNewChat = async () => {
    if (messages.some(m => m.role === 'user')) {
      await saveSession(messages, sessionIdRef.current);
    }
    setMessages([GREETING]);
    setSessionId(null);
    setInput('');
    setPendingConfirmation(null);
    setHistoryOpen(false);
  };

  const resumeSession = async (id) => {
    if (messages.some(m => m.role === 'user')) {
      await saveSession(messages, sessionIdRef.current);
    }
    try {
      const { data } = await api.get(`/chat/sessions/${id}`);
      setMessages(data.messages?.length ? data.messages : [GREETING]);
      setSessionId(id);
      setPendingConfirmation(null);
      setHistoryOpen(false);
    } catch {
      // ignore
    }
  };

  const deleteSession = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/chat/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionIdRef.current === id) setSessionId(null);
    } catch {
      // ignore
    }
  };

  const finishWithReply = async (finalMessages, data) => {
    const reply = data.reply || data.content || 'Done!';
    const diffCards = data.diffCards || [];
    const withReply = [...finalMessages, { role: 'assistant', content: reply, diffCards }];
    setMessages(withReply);
    const newId = await saveSession(withReply, sessionIdRef.current);
    if (newId && newId !== sessionIdRef.current) setSessionId(newId);
  };

  // Turns an existing assistant message into a new variant carrying `reply`,
  // keeping earlier variants (including the original) reachable via the nav arrows.
  const withVariant = (msg, reply, diffCards) => {
    const variants = msg.variants?.length ? msg.variants : [{ content: msg.content, diffCards: msg.diffCards || [] }];
    const newVariants = [...variants, { content: reply, diffCards }];
    return { role: 'assistant', content: reply, diffCards, variants: newVariants, variantIndex: newVariants.length - 1 };
  };

  const applyRegeneratedReply = (index, data) => {
    const reply = data.reply || data.content || 'Done!';
    const diffCards = data.diffCards || [];
    setMessages(prev => {
      const next = [...prev.slice(0, index), withVariant(prev[index], reply, diffCards)];
      saveSession(next, sessionIdRef.current).then(newId => {
        if (newId && newId !== sessionIdRef.current) setSessionId(newId);
      });
      return next;
    });
  };

  const regenerateMessage = async (index) => {
    if (loading) return;
    setPendingConfirmation(null);
    setRegeneratingIndex(index);
    setLoading(true);
    const context = messages.slice(0, index);
    try {
      const { data } = await api.post('/chat', { messages: context });

      if (data.requiresConfirmation) {
        setPendingConfirmation({
          toolCalls: data.pendingToolCalls,
          assistantMessage: data.pendingAssistantMessage,
          forMessages: context,
          regenerateIndex: index,
        });
        return;
      }

      applyRegeneratedReply(index, data);
    } catch (err) {
      const detail = err?.response?.data?.detail || '';
      setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong${detail ? ': ' + detail : '. Please try again.'}` }]);
    } finally {
      setLoading(false);
      setRegeneratingIndex(null);
    }
  };

  const navigateVariant = (index, dir) => {
    setMessages(prev => {
      const msg = prev[index];
      if (!msg.variants) return prev;
      const newIdx = msg.variantIndex + dir;
      if (newIdx < 0 || newIdx >= msg.variants.length) return prev;
      const v = msg.variants[newIdx];
      const next = [...prev.slice(0, index), { ...msg, content: v.content, diffCards: v.diffCards, variantIndex: newIdx }, ...prev.slice(index + 1)];
      saveSession(next, sessionIdRef.current);
      return next;
    });
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    setPendingConfirmation(null);

    const userMsg = { role: 'user', content: input.trim() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/chat', { messages: withUser });

      if (data.requiresConfirmation) {
        setPendingConfirmation({
          toolCalls: data.pendingToolCalls,
          assistantMessage: data.pendingAssistantMessage,
          forMessages: withUser,
        });
        return;
      }

      await finishWithReply(withUser, data);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || '';
      let content;
      if (status === 503) {
        content = "Sorry, I'm not connected to an Ai Provider right now. Check the Ai Provider Config settings in Admin panel.";
      } else if (status === 401 || status === 403) {
        content = 'Session expired. Please refresh the page.';
      } else {
        content = `Something went wrong${detail ? ': ' + detail : '. Please try again.'}`;
      }
      setMessages(prev => [...prev, { role: 'assistant', content }]);
    } finally {
      setLoading(false);
    }
  };

  const approveActions = async () => {
    if (!pendingConfirmation) return;
    setLoading(true);
    const { toolCalls, assistantMessage, forMessages, regenerateIndex } = pendingConfirmation;
    setPendingConfirmation(null);

    try {
      const { data } = await api.post('/chat', {
        messages: forMessages,
        confirmedToolCalls: toolCalls,
        pendingAssistantMessage: assistantMessage,
      });
      if (regenerateIndex != null) {
        applyRegeneratedReply(regenerateIndex, data);
      } else {
        await finishWithReply(forMessages, data);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || '';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Something went wrong${detail ? ': ' + detail : '. Please try again.'}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const denyActions = () => {
    setPendingConfirmation(null);
    setMessages(prev => [...prev, { role: 'assistant', content: "OK, I won't make those changes." }]);
  };

  const drawerTransition = chatOpen
    ? 'opacity 260ms ease, transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'opacity 160ms ease-in, transform 160ms ease-in';

  const fabTransition = chatOpen
    ? 'opacity 140ms ease-in, transform 160ms ease-in'
    : 'opacity 280ms ease, transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)';

  return (
    <>
      {/* Phone already has a dedicated "dotAi" bottom-nav item that toggles
          chat — the floating launcher would just duplicate it and sit on
          top of the bottom nav bar, so skip it there. */}
      {mode !== 'phone' && (
        <button
          onClick={() => setChatOpen(true)}
          title="Ask dotAi"
          aria-label="Ask dotAi"
          style={{ transition: fabTransition }}
          className={`fixed bottom-6 right-6 w-16 h-16 rounded-full bg-surface-container-lowest shadow-heavy flex items-center justify-center z-50
            active:scale-[0.93] ring-1 ring-outline-variant/20
            ${chatOpen ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}`}
        >
          <DotIcon size={34} />
        </button>
      )}

      <div
        style={{ transition: drawerTransition }}
        className={`fixed bottom-6 right-6 w-[400px] h-[600px] bg-surface-bright rounded-3xl shadow-2xl border border-outline-variant/20 flex flex-col z-50 overflow-hidden
          ${chatOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-[0.93] pointer-events-none'}`}
      >
        {/* History panel */}
        <div
          className={`absolute inset-0 z-10 flex flex-col bg-surface-bright rounded-3xl transition-transform duration-300 ease-out ${
            historyOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center gap-3 bg-surface-container-low/60">
            <button
              onClick={() => setHistoryOpen(false)}
              className="p-1.5 rounded-full hover:bg-surface-container transition-colors duration-150"
            >
              <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
            </button>
            <p className="text-label-lg font-semibold text-on-surface tracking-wide flex-1">Chat History</p>
            <button
              onClick={startNewChat}
              title="New chat"
              className="p-1.5 rounded-full hover:bg-surface-container transition-colors duration-150 text-primary"
            >
              <span className="material-symbols-outlined text-[20px]">add_comment</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {historyLoading && (
              <div className="flex justify-center py-10">
                <span className="material-symbols-outlined animate-spin text-primary text-[24px]">progress_activity</span>
              </div>
            )}
            {!historyLoading && sessions.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <span className="material-symbols-outlined text-on-surface-variant text-[40px]">chat_bubble_outline</span>
                <p className="text-body-md text-on-surface-variant">No saved chats yet</p>
              </div>
            )}
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => resumeSession(s.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-150 hover:bg-surface-container
                  ${sessionId === s.id ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
              >
                <span className="material-symbols-outlined text-on-surface-variant text-[18px] flex-shrink-0">chat</span>
                <div className="flex-1 min-w-0">
                  <p className="text-body-md text-on-surface truncate">{s.title}</p>
                  <p className="text-label-sm text-on-surface-variant">{formatRelativeDate(s.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 p-1 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/15 flex items-center gap-3 bg-surface-container-low/60 flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center ring-1 ring-outline-variant/20">
            <DotIcon size={26} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-label-md text-primary font-bold tracking-widest">dotAi Assistant</p>
            <p className="text-headline-md text-on-surface font-light tracking-wide">How can I help?</p>
          </div>
          <button
            onClick={startNewChat}
            title="New chat"
            className="p-1.5 rounded-full hover:bg-surface-container transition-colors duration-150"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">add_comment</span>
          </button>
          <button
            onClick={() => setChatOpen(false)}
            aria-label="Minimize chat"
            className="p-1.5 rounded-full transition-[background-color,transform] duration-150 hover:bg-surface-container active:scale-[0.97]"
          >
            <span className="material-symbols-outlined text-on-surface-variant">remove</span>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-container-lowest/40">
          {messages.map((msg, i) => (
            <Message
              key={i}
              msg={msg}
              canRegenerate={i === messages.length - 1 && msg.role === 'assistant' && !pendingConfirmation && messages.slice(0, i).some(m => m.role === 'user')}
              onRegenerate={() => regenerateMessage(i)}
              onNavigate={(dir) => navigateVariant(i, dir)}
              regenerating={regeneratingIndex === i}
            />
          ))}

          {pendingConfirmation && (
            <ConfirmationCard
              toolCalls={pendingConfirmation.toolCalls}
              onApprove={approveActions}
              onDeny={denyActions}
              loading={loading}
            />
          )}

          {loading && !pendingConfirmation && (
            <div className="flex justify-start">
              <div className="bg-surface p-4 rounded-2xl rounded-tl-sm shadow-soft border border-outline-variant/15 flex items-center gap-2">
                <span className="material-symbols-outlined animate-spin text-primary text-[16px]">progress_activity</span>
                <span className="text-body-md text-on-surface-variant">dotAi is thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-outline-variant/15 bg-surface-container-low/60 flex-shrink-0">
          <div className="flex items-center gap-2 bg-surface rounded-full px-4 py-2 shadow-sm">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask dot anything..."
              className="flex-1 bg-transparent text-body-md font-light tracking-wide text-on-surface placeholder:text-on-surface-variant outline-none focus:outline-none focus:ring-0 border-none"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 flex-shrink-0
                transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
            </button>
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant/15">
            <div className="flex items-center gap-3">
              <button
                onClick={openHistory}
                className="text-label-sm text-on-surface-variant hover:text-primary transition-colors duration-150 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">history</span>
                History
              </button>
              <div className="w-px h-3.5 bg-outline-variant/30" />
              <button
                onClick={() => { setChatOpen(false); navigate('/settings#ai-settings'); }}
                className="text-label-sm text-on-surface-variant hover:text-primary transition-colors duration-150 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">settings</span>
                Settings
              </button>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              aria-label="Minimize chat"
              className="flex items-center gap-1 pl-2.5 pr-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high
                text-on-surface-variant hover:text-on-surface transition-[background-color,color,transform] duration-150 active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px]">keyboard_arrow_down</span>
              <span className="text-label-sm">Minimize</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
