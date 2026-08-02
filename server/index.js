require('dotenv').config();
const logger = require('./utils/logger');
console.log(`[paperr] Log file: ${logger.LOG_PATH}`);
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : false,
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join-space', (spaceId) => {
    socket.rooms.forEach(room => {
      if (room.startsWith('space:')) socket.leave(room);
    });
    socket.join(`space:${spaceId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? ['http://localhost:5173', 'http://127.0.0.1:5173']
    : false,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    logger.info(`${req.method} ${req.path}`, { body: req.body, query: req.query });
  }
  next();
});

// ─── Static file serving (uploads) ───────────────────────────────────────────
const uploadsPath = path.resolve(process.env.UPLOADS_PATH || './uploads');
app.use('/uploads', express.static(uploadsPath));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/spaces', require('./routes/spaces').router);
app.use('/api/users', require('./routes/users'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/deep-work', require('./routes/deepWork'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/list-templates', require('./routes/listTemplates'));
app.use('/api/areas', require('./routes/areas'));
app.use('/api/hub', require('./routes/hub'));
app.use('/api/sticky-notes', require('./routes/stickyNotes'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/chat', require('./routes/chat')(io));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/notes',    require('./routes/notes'));
app.use('/api/routines', require('./routes/routines'));
app.use('/api/wellness', require('./routes/wellness'));
app.use('/api/mood',     require('./routes/mood'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/frame',    require('./routes/frame'));
app.use('/api/good-thoughts', require('./routes/goodThoughts'));
app.use('/api/backups',  require('./routes/backups'));
app.use('/api/ai-server', require('./routes/aiServer'));

const scheduler = require('./ai/scheduler');
app.use('/api/agent-insights', require('./routes/agentInsights')(io));
app.use('/api/custom-agents',  require('./routes/customAgents')(io, scheduler));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Serve React in production ────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../client/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 paperr server running on http://0.0.0.0:${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   API:     http://localhost:${PORT}/api/health\n`);
  scheduler.startScheduler(io);
  require('./services/backupService').startAutoBackupScheduler();
  require('./ai/litertSupervisor').start(); // no-ops if litert-lm isn't installed
});

// Make sure the litert-lm child process (and its own python.exe worker) never
// outlives paperr — a bare process.exit() would leave it holding port 9379.
function shutdown() {
  require('./ai/litertSupervisor').stop().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app, io };
