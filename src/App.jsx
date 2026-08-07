import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Trash2, Loader2, Sparkles, Globe, Cpu, Zap, Brain, ChevronDown, Check, Terminal, Copy, Menu, Plus, X, MessageSquare, Paperclip, FileText, XCircle, Code, Eye, Image as ImageIcon, Wand2, Download, Edit3, FileCode, Settings, Moon, Sun, ShieldAlert, Sliders } from 'lucide-react';

const apiKey = ""; 

const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error; 
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

const generateOrEditImage = async (prompt, sourceImageBase64) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
  let parts = [{ text: prompt }];
  if (sourceImageBase64) {
    parts.push({ inlineData: { mimeType: "image/png", data: sourceImageBase64 } });
  }
  const payload = { contents: [{ parts: parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } };
  try {
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const candidateParts = data.candidates?.[0]?.content?.parts || [];
    let imageBase64Result = null;
    let textResponse = "";
    for (const part of candidateParts) {
      if (part.inlineData && part.inlineData.data) {
        imageBase64Result = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      } else if (part.text) {
        textResponse += part.text;
      }
    }
    return { text: textResponse || "Imagem gerada com sucesso!", generatedImage: imageBase64Result };
  } catch (error) {
    return { text: "Erro ao processar imagem.", generatedImage: null };
  }
};

const generateAIResponse = async (prompt, history, mode, currentAttachment, customSystemPrompt) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const contents = history.map(msg => {
    const parts = [{ text: msg.text }];
    if (msg.attachment && msg.attachment.isImage) {
      parts.push({ inlineData: { mimeType: msg.attachment.mimeType, data: msg.attachment.base64 } });
    }
    return { role: msg.role === 'user' ? 'user' : 'model', parts: parts };
  });

  let finalPromptText = prompt;
  const currentParts = [];

  if (currentAttachment && !currentAttachment.isImage) {
    finalPromptText = `[Contexto de Ficheiro]\nNome: ${currentAttachment.name}\nConteúdo:\n\`\`\`\n${currentAttachment.textContent}\n\`\`\`\n\nInstrução: ${prompt || "Analisa o ficheiro."}`;
  }

  currentParts.push({ text: finalPromptText || "Analisa o conteúdo." });
  if (currentAttachment && currentAttachment.isImage) {
    currentParts.push({ inlineData: { mimeType: currentAttachment.mimeType, data: currentAttachment.base64 } });
  }

  contents.push({ role: 'user', parts: currentParts });

  let systemText = customSystemPrompt || "És um assistente útil.";
  let tools = undefined;

  // Se o utilizador não personalizou nas definições, usa as diretrizes padrão de cada modo
  if (!customSystemPrompt) {
    switch (mode) {
      case 'flash':
        systemText = "És um assistente ultrarrápido em Português de Portugal.";
        break;
      case 'medio':
        systemText = "És um assistente equilibrado e amigável em Português de Portugal.";
        break;
      case 'pro':
        systemText = "És um Engenheiro de Software Sênior e Arquiteto de Sistemas em Português de Portugal. Podes usar pesquisa web.";
        tools = [{ google_search: {} }];
        break;
      case 'image-studio':
        systemText = "És um Designer Gráfico e Especialista em Imagem AI.";
        break;
      case 'canvas':
        systemText = "És um escritor criativo e programador especialista. Fornece conteúdo limpo, rico e bem estruturado.";
        break;
    }
  } else if (mode === 'pro') {
    tools = [{ google_search: {} }];
  }

  const payload = { contents: contents, systemInstruction: { parts: [{ text: systemText }] } };
  if (tools) payload.tools = tools;

  try {
    const data = await fetchWithRetry(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const hasSearchGrounding = data.candidates?.[0]?.groundingMetadata?.groundingAttributions?.length > 0;
    return { text: text || "Resposta gerada.", usedSearch: hasSearchGrounding };
  } catch (error) {
    return { text: "Erro de ligação ao servidor.", usedSearch: false };
  }
};

const MessageContent = ({ text }) => {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-3">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
          const language = match?.[1] || 'código';
          const code = match?.[2] || part.replace(/```/g, '');
          return <CodeBlock key={index} code={code.trim()} language={language} />;
        }
        if (part.trim() === '') return null;
        return <div key={index} className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{part}</div>;
      })}
    </div>
  );
};

const CodeBlock = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try { navigator.clipboard.writeText(code); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden shadow-sm border border-slate-700 bg-[#0d1117] text-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">{language}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors">
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-slate-200 font-mono text-[13px] leading-relaxed"><code>{code}</code></pre>
      </div>
    </div>
  );
};

const MODES = {
  flash: { id: 'flash', name: 'Flash', desc: 'Rápido', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-100', btnBg: 'bg-amber-500', isDark: false, welcome: 'Olá! Assistente Flash pronto.' },
  medio: { id: 'medio', name: 'Médio', desc: 'Equilibrado', icon: Brain, color: 'text-purple-500', bg: 'bg-purple-100', btnBg: 'bg-purple-500', isDark: false, welcome: 'Olá! Como posso ajudar?' },
  pro: { id: 'pro', name: 'Pro', desc: 'Engenharia / Web', icon: Terminal, color: 'text-emerald-400', bg: 'bg-slate-800', btnBg: 'bg-emerald-500', isDark: true, welcome: 'Sistemas Pro online.' },
  'image-studio': { id: 'image-studio', name: 'Estúdio de Imagem', desc: 'Criar / Editar Imagens', icon: Wand2, color: 'text-pink-400', bg: 'bg-pink-900/30', btnBg: 'bg-pink-600', isDark: true, welcome: 'Estúdio de Imagem ativo.' },
  'canvas': { id: 'canvas', name: 'Canvas', desc: 'Programar, Escrever e Criar', icon: Edit3, color: 'text-blue-400', bg: 'bg-blue-900/30', btnBg: 'bg-blue-600', isDark: true, welcome: 'Modo Canvas ativado. Pede conteúdo para preencher o painel lateral.' }
};

export default function App() {
  const [mode, setMode] = useState('canvas');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Estado de Configurações
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    customSystemPrompt: '',
    autoScroll: true,
    soundEffects: false,
    themeMode: 'dark' // 'dark' ou 'light'
  });

  // Estado do Canvas
  const [isCanvasOpen, setIsCanvasOpen] = useState(true);
  const [canvasContent, setCanvasContent] = useState('# Documento Canvas\n\nPede à IA para gerar textos, ensaios ou código.');
  const [canvasTitle, setCanvasTitle] = useState('Projeto Sem Título');

  const [chats, setChats] = useState([
    {
      id: Date.now().toString(),
      title: 'Conversa Principal',
      mode: 'canvas',
      messages: [{ role: 'model', text: MODES['canvas'].welcome, usedSearch: false }],
      updatedAt: Date.now()
    }
  ]);
  const [activeChatId, setActiveChatId] = useState(chats[0].id);
  
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [attachment, setAttachment] = useState(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [previewContent, setPreviewContent] = useState(null);
  const fileInputRef = useRef(null);
  
  const messagesEndRef = useRef(null);
  const currentMode = MODES[mode];
  const activeMessages = chats.find(c => c.id === activeChatId)?.messages || [];

  const scrollToBottom = () => {
    if (settings.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages, isLoading, attachment]);

  const handleDownloadImage = (base64DataUrl) => {
    try {
      const arr = base64DataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) { u8arr[n] = bstr.charCodeAt(n); }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `criacao-ia-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      const link = document.createElement('a');
      link.href = base64DataUrl;
      link.download = `criacao-ia-${Date.now()}.png`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newChat = {
      id: newId, title: 'Nova Conversa', mode: mode,
      messages: [{ role: 'model', text: MODES[mode].welcome, usedSearch: false }],
      updatedAt: Date.now()
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newId);
    setIsSidebarOpen(false);
    setInputText('');
    setAttachment(null);
  };

  const deleteChat = (e, idToDelete) => {
    e.stopPropagation();
    setChats(prev => {
      const remaining = prev.filter(c => c.id !== idToDelete);
      if (remaining.length === 0) {
        const newId = Date.now().toString();
        setActiveChatId(newId);
        return [{
          id: newId, title: 'Nova Conversa', mode: mode,
          messages: [{ role: 'model', text: MODES[mode].welcome, usedSearch: false }],
          updatedAt: Date.now()
        }];
      }
      if (idToDelete === activeChatId) {
        setActiveChatId(remaining[0].id);
        setMode(remaining[0].mode);
      }
      return remaining;
    });
  };

  const selectChat = (id) => {
    setActiveChatId(id);
    const selectedChat = chats.find(c => c.id === id);
    if (selectedChat) setMode(selectedChat.mode);
    setIsSidebarOpen(false);
  };

  const generateTitle = (text) => {
    const words = text.trim().split(/\s+/);
    if (words.length <= 4) return text.trim();
    return words.slice(0, 4).join(' ') + '...';
  };

  const triggerFileInput = () => { fileInputRef.current?.click(); };
  const clearAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsReadingFile(true);
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onloadend = () => {
      if (isImage) {
        const base64Data = reader.result.split(',')[1];
        setAttachment({ file, name: file.name, mimeType: file.type, isImage: true, url: reader.result, base64: base64Data });
      } else {
        setAttachment({ file, name: file.name, mimeType: file.type || 'text/plain', isImage: false, textContent: reader.result });
      }
      setIsReadingFile(false);
    };
    reader.onerror = () => { setIsReadingFile(false); };
    if (isImage) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !attachment) || isLoading || isReadingFile) return;

    const userMessage = inputText.trim();
    const currentChat = chats.find(c => c.id === activeChatId);
    
    let newTitle = currentChat.title;
    if (currentChat.messages.filter(m => m.role === 'user').length === 0) {
      newTitle = generateTitle(userMessage || (attachment ? `Ficheiro: ${attachment.name}` : 'Conversa'));
    }

    const newMessage = { role: 'user', text: userMessage, attachment: attachment ? { ...attachment } : null };
    const updatedUserMessages = [...currentChat.messages, newMessage];
    
    setChats(prev => prev.map(chat => 
      chat.id === activeChatId ? { ...chat, messages: updatedUserMessages, title: newTitle, mode: mode, updatedAt: Date.now() } : chat
    ));
    
    const attachmentToSend = attachment;
    setInputText('');
    clearAttachment();
    setIsLoading(true);
    setIsModeMenuOpen(false);

    let aiResponseText = "";
    let generatedImg = null;
    let usedSearchFlag = false;

    if (mode === 'image-studio') {
      const base64ImageToEdit = attachmentToSend && attachmentToSend.isImage ? attachmentToSend.base64 : null;
      const imgResult = await generateOrEditImage(userMessage || "Modifica esta imagem", base64ImageToEdit);
      aiResponseText = imgResult.text;
      generatedImg = imgResult.generatedImage;
    } else {
      const normalResult = await generateAIResponse(userMessage, currentChat.messages, mode, attachmentToSend, settings.customSystemPrompt);
      aiResponseText = normalResult.text;
      usedSearchFlag = normalResult.usedSearch;

      if (mode === 'canvas') {
        setCanvasContent(aiResponseText);
        setCanvasTitle(userMessage.length > 20 ? userMessage.substring(0, 20) + '...' : userMessage);
        setIsCanvasOpen(true);
      }
    }

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        return {
          ...chat,
          messages: [...chat.messages, { role: 'model', text: aiResponseText, usedSearch: usedSearchFlag, generatedImage: generatedImg }],
          updatedAt: Date.now()
        };
      }
      return chat;
    }));
    
    setIsLoading(false);
  };

  const CurrentIcon = currentMode.icon;
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const isDarkTheme = settings.themeMode === 'dark';

  return (
    <div className={`flex h-[100dvh] w-full max-w-7xl mx-auto font-sans shadow-2xl sm:h-[90vh] sm:mt-8 overflow-hidden relative sm:rounded-xl border-x sm:border-y ${isDarkTheme ? 'bg-[#05070a] text-slate-100 border-slate-800' : 'bg-gray-50 text-gray-800 border-gray-200'}`}>
      
      {/* Modal de Configurações */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className={`border w-full max-w-md rounded-2xl overflow-hidden flex flex-col shadow-2xl ${isDarkTheme ? 'bg-[#0d1117] border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'}`}>
            <div className="flex items-center justify-between p-4 border-b border-inherit">
              <h3 className="font-bold text-lg flex items-center gap-2"><Settings size={20} className="text-blue-500" /> Configurações do Assistente</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 rounded-lg hover:opacity-75"><X size={20} /></button>
            </div>
            
            <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* Tema visual */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-70">Tema Visual</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setSettings(s => ({ ...s, themeMode: 'dark' }))}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-colors ${settings.themeMode === 'dark' ? 'bg-blue-600 text-white border-blue-500' : 'border-inherit hover:opacity-80'}`}
                  >
                    <Moon size={16} /> Escuro (Dev)
                  </button>
                  <button 
                    onClick={() => setSettings(s => ({ ...s, themeMode: 'light' }))}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium transition-colors ${settings.themeMode === 'light' ? 'bg-blue-600 text-white border-blue-500' : 'border-inherit hover:opacity-80'}`}
                  >
                    <Sun size={16} /> Claro
                  </button>
                </div>
              </div>

              {/* Prompt de Sistema Personalizado */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-70">Instrução de Sistema Personalizada (System Prompt)</label>
                <textarea 
                  value={settings.customSystemPrompt}
                  onChange={(e) => setSettings(s => ({ ...s, customSystemPrompt: e.target.value }))}
                  placeholder="Ex: Responde sempre em tom de pirata, ou sê estritamente conciso..."
                  className={`w-full h-24 p-3 rounded-xl border text-xs font-mono outline-none resize-none transition-colors ${isDarkTheme ? 'bg-[#161b22] border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-800 focus:border-blue-500'}`}
                />
                <p className="text-[10px] opacity-60">Se deixar em branco, o aplicativo usará as instruções padrão do modo selecionado.</p>
              </div>

              {/* Opções de Rolagem e Comportamento */}
              <div className="space-y-3 pt-2 border-t border-inherit">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Auto-rolagem no Chat</span>
                  <input 
                    type="checkbox" 
                    checked={settings.autoScroll} 
                    onChange={(e) => setSettings(s => ({ ...s, autoScroll: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Limpeza de Dados */}
              <div className="pt-3 border-t border-inherit">
                <button 
                  onClick={() => {
                    if (window.confirm("Tens a certeza que pretendes limpar todo o histórico?")) {
                      setChats([{ id: Date.now().toString(), title: 'Nova Conversa', mode: mode, messages: [{ role: 'model', text: 'Histórico limpo.', usedSearch: false }], updatedAt: Date.now() }]);
                      setActiveChatId(chats[0].id);
                      setIsSettingsOpen(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl text-sm font-semibold transition-colors"
                >
                  <Trash2 size={16} /> Limpar Todo o Histórico
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-inherit flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                Guardar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pré-visualização de ficheiros */}
      {previewContent && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1117] border border-slate-700 w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
            <div className="flex items-center justify-between p-4 bg-[#161b22] border-b border-slate-700">
              <span className="text-white font-mono text-sm truncate">{previewContent.name}</span>
              <button onClick={() => setPreviewContent(null)} className="text-slate-400 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
              {previewContent.textContent}
            </div>
          </div>
        </div>
      )}

      {/* Histórico Lateral */}
      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 sm:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)} />}
      
      <aside className={`absolute sm:relative top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-800 flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Sparkles size={20} className="text-blue-500" /> Histórico
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="sm:hidden text-slate-400 hover:text-white p-1 rounded-md"><X size={20} /></button>
        </div>
        <div className="p-3">
          <button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-sm">
            <Plus size={18} /> Nova Conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {sortedChats.map(chat => {
            const isActive = chat.id === activeChatId;
            const ChatModeIcon = MODES[chat.mode]?.icon || MessageSquare;
            return (
              <div key={chat.id} onClick={() => selectChat(chat.id)} className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${isActive ? 'bg-slate-800 border border-slate-700' : 'hover:bg-slate-800/50 border border-transparent'}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`p-1.5 rounded-lg ${isActive ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 group-hover:text-slate-400'}`}>
                     <ChatModeIcon size={16} />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className={`text-sm truncate font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>{chat.title}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">{MODES[chat.mode]?.name || 'Chat'}</span>
                  </div>
                </div>
                <button onClick={(e) => deleteChat(e, chat.id)} className={`p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 ${isActive ? 'opacity-100' : ''}`} title="Apagar">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Seção Central do Chat */}
      <div className="flex-1 flex flex-col h-full w-full relative min-w-0">
        
        <header className={`flex items-center justify-between p-4 border-b transition-colors duration-300 shadow-sm z-20 ${isDarkTheme ? 'bg-[#0d1117] border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className={`sm:hidden p-2 rounded-lg -ml-2 mr-1 transition-colors ${isDarkTheme ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Menu size={24} />
            </button>
            <div className="relative">
              <button onClick={() => setIsModeMenuOpen(!isModeMenuOpen)} className={`flex items-center gap-2.5 p-1.5 pr-3 rounded-full transition-all ${isDarkTheme ? 'hover:bg-slate-800 bg-[#161b22] border border-slate-700' : 'hover:bg-gray-100 bg-gray-50 border border-gray-200'}`}>
                <div className={`p-1.5 rounded-full ${currentMode.btnBg} text-white shadow-sm`}><CurrentIcon size={16} /></div>
                <div className="flex flex-col items-start">
                  <span className={`font-bold text-sm leading-tight flex items-center gap-1 ${isDarkTheme ? 'text-white' : 'text-gray-900'}`}>
                    {currentMode.name} <ChevronDown size={14} className={`transition-transform ${isModeMenuOpen ? 'rotate-180' : ''}`} />
                  </span>
                </div>
              </button>
              {isModeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsModeMenuOpen(false)} />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-40 transform animate-in fade-in zoom-in-95 duration-200 text-gray-800">
                    <div className="p-2 space-y-1">
                      {Object.values(MODES).map((m) => (
                        <button key={m.id} onClick={() => { setMode(m.id); setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, mode: m.id } : c)); setIsModeMenuOpen(false); }} className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left ${mode === m.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${mode === m.id ? m.btnBg + ' text-white' : m.bg + ' ' + m.color}`}><m.icon size={18} /></div>
                            <div>
                              <div className={`font-semibold text-sm ${mode === m.id ? 'text-gray-900' : 'text-gray-700'}`}>{m.name}</div>
                              <div className="text-xs text-gray-500">{m.desc}</div>
                            </div>
                          </div>
                          {mode === m.id && <Check size={18} className={m.color} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCanvasOpen(!isCanvasOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${isCanvasOpen ? 'bg-blue-600 text-white shadow-sm' : (isDarkTheme ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}`}
            >
              <Edit3 size={14} /> {isCanvasOpen ? 'Fechar Canvas' : 'Canvas'}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`p-2 rounded-xl transition-colors ${isDarkTheme ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Configurações"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto p-4 space-y-6 transition-colors duration-300 ${isDarkTheme ? 'bg-[#05070a]' : 'bg-gray-50'}`}>
          {activeMessages.map((msg, index) => (
            <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`flex items-start gap-2 max-w-[95%] sm:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                <div className={`flex-shrink-0 w-8 h-8 mt-1 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? (isDarkTheme ? 'bg-slate-800 text-slate-300' : 'bg-gray-200 text-gray-700') : `${currentMode.btnBg} text-white`}`}>
                  {msg.role === 'user' ? <User size={16} /> : <CurrentIcon size={16} />}
                </div>

                <div className="flex flex-col gap-1 w-full overflow-hidden">
                  <div className={`px-4 py-3 rounded-2xl shadow-sm ${msg.role === 'user' ? (isDarkTheme ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-gray-800 text-white rounded-tr-sm') : (isDarkTheme ? 'bg-[#161b22] border border-slate-800 text-slate-200 rounded-tl-sm' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm')}`}>
                    
                    {msg.attachment && (
                      <div className="mb-3 rounded-lg overflow-hidden border border-white/20">
                        {msg.attachment.isImage ? (
                          <img src={msg.attachment.url} alt="Anexo" className="max-w-full h-auto max-h-64 object-contain bg-black/10" />
                        ) : (
                          <div className="flex items-center justify-between p-3 bg-black/20 text-sm">
                            <div className="flex items-center gap-2 truncate">
                              <Code size={18} className="text-emerald-400 flex-shrink-0" />
                              <span className="truncate font-mono text-xs">{msg.attachment.name}</span>
                            </div>
                            <button onClick={() => setPreviewContent(msg.attachment)} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 ml-2 flex-shrink-0 bg-blue-500/10 px-2 py-1 rounded">
                              <Eye size={14} /> Ler
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {msg.text && <MessageContent text={msg.text} />}

                    {msg.generatedImage && (
                      <div className="mt-3 rounded-xl overflow-hidden border border-white/20 shadow-lg bg-black/40">
                        <img src={msg.generatedImage} alt="Criado por IA" className="w-full h-auto max-h-96 object-contain" />
                        <div className="p-2 bg-black/60 flex justify-end">
                          <button onClick={() => handleDownloadImage(msg.generatedImage)} className="flex items-center gap-1.5 text-xs text-white bg-pink-600 hover:bg-pink-700 px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm">
                            <Download size={14} /> Baixar Imagem
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex flex-col items-start">
               <div className="flex items-start gap-2 max-w-[85%]">
                <div className={`flex-shrink-0 w-8 h-8 mt-1 rounded-full flex items-center justify-center shadow-sm text-white ${currentMode.btnBg}`}><CurrentIcon size={16} /></div>
                <div className={`px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm flex flex-col gap-2 ${isDarkTheme ? 'bg-[#161b22] border border-slate-800' : 'bg-white border border-gray-100'}`}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${currentMode.btnBg}`} style={{ animationDelay: '0ms' }}></div>
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${currentMode.btnBg}`} style={{ animationDelay: '150ms' }}></div>
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${currentMode.btnBg}`} style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </main>

        <footer className={`p-3 border-t z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative flex flex-col ${isDarkTheme ? 'bg-[#0d1117] border-slate-800' : 'bg-white border-gray-200'}`}>
          {attachment && (
            <div className={`mb-2 p-2 rounded-xl flex items-center justify-between border shadow-sm ${isDarkTheme ? 'bg-[#161b22] border-slate-700 text-slate-200' : 'bg-gray-50 border-gray-200 text-gray-800'}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 ${isDarkTheme ? 'bg-slate-800 text-emerald-400' : 'bg-gray-200 text-gray-700'}`}>
                  {attachment.isImage ? <img src={attachment.url} alt="Preview" className="w-full h-full object-cover" /> : <Code size={20} />}
                </div>
                <div className="flex flex-col truncate">
                  <span className="text-sm font-medium truncate font-mono">{attachment.name}</span>
                  <span className="text-[10px] opacity-60 uppercase">{attachment.isImage ? 'Imagem' : 'Ficheiro'}</span>
                </div>
              </div>
              <button onClick={clearAttachment} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><XCircle size={20} /></button>
            </div>
          )}

          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

          <form onSubmit={handleSendMessage} className={`flex items-center gap-1.5 p-1.5 rounded-2xl border transition-all ${isDarkTheme ? 'bg-[#161b22] border-slate-700 focus-within:ring-1 focus-within:ring-blue-500' : 'bg-gray-100 border-gray-200 focus-within:ring-2 focus-within:ring-gray-400'}`}>
            <button type="button" onClick={triggerFileInput} disabled={isLoading || isReadingFile} className={`p-2.5 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 ${isDarkTheme ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-800'}`}>
              {isReadingFile ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
            </button>
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={mode === 'canvas' ? 'Pede para criar um artigo, código ou texto...' : 'Escreve uma mensagem...'} disabled={isLoading || isReadingFile} className={`flex-1 bg-transparent py-2 px-1 outline-none text-[15px] disabled:opacity-50 ${isDarkTheme ? 'text-slate-200 placeholder:text-slate-500' : 'text-gray-800 placeholder:text-gray-400'}`} autoComplete="off" />
            <button type="submit" disabled={(!inputText.trim() && !attachment) || isLoading || isReadingFile} className={`text-white p-3 rounded-xl transition-all flex-shrink-0 shadow-sm focus:outline-none disabled:bg-slate-700 disabled:text-slate-500 ${!(!inputText.trim() && !attachment || isLoading) && currentMode.btnBg} ${!(!inputText.trim() && !attachment || isLoading) && 'hover:opacity-90'}`}>
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-0.5" />}
            </button>
          </form>
          <div className="h-2 sm:hidden"></div>
        </footer>
      </div>

      {/* Painel Lateral Canvas */}
      {isCanvasOpen && (
        <div className={`w-full sm:w-[420px] border-l flex flex-col z-30 absolute sm:relative right-0 h-full shadow-2xl ${isDarkTheme ? 'bg-[#0d1117] border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`p-3 border-b flex items-center justify-between ${isDarkTheme ? 'bg-[#161b22] border-slate-800' : 'bg-gray-100 border-gray-200'}`}>
            <div className="flex items-center gap-2 overflow-hidden">
              <FileCode size={18} className="text-blue-400 flex-shrink-0" />
              <input 
                type="text" 
                value={canvasTitle} 
                onChange={(e) => setCanvasTitle(e.target.value)} 
                className="bg-transparent text-xs font-mono font-bold outline-none truncate w-full"
                title="Título do Documento"
              />
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => { try { navigator.clipboard.writeText(canvasContent); } catch (e) {} }} 
                className="p-1.5 opacity-70 hover:opacity-100 rounded transition-colors"
                title="Copiar Conteúdo"
              >
                <Copy size={16} />
              </button>
              <button onClick={() => setIsCanvasOpen(false)} className="p-1.5 opacity-70 hover:opacity-100 rounded transition-colors sm:hidden">
                <X size={18} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <textarea
              value={canvasContent}
              onChange={(e) => setCanvasContent(e.target.value)}
              placeholder="Escreve ou gera conteúdo com a IA..."
              className={`w-full h-full border text-xs font-mono leading-relaxed p-4 rounded-xl outline-none resize-none transition-colors ${isDarkTheme ? 'bg-[#05070a] border-slate-800 text-slate-200 focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-800 focus:border-blue-500'}`}
            />
          </div>

          <div className={`p-3 border-t flex items-center justify-between text-xs opacity-80 ${isDarkTheme ? 'bg-[#161b22] border-slate-800' : 'bg-gray-100 border-gray-200'}`}>
            <span>Editor Canvas</span>
            <button 
              onClick={() => {
                const blob = new Blob([canvasContent], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${canvasTitle.toLowerCase().replace(/\s+/g, '-')}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm"
            >
              Exportar Ficheiro
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

