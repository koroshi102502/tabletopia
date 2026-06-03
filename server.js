const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname)));

// Store connected users with their colors
const users = new Map();
// Store available lobby boards
const boards = [];
const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#ABEBC6'
];

function broadcastBoards() {
    io.emit('lobby:boards', boards);
}

function cleanupDisconnectedBoards() {
    for (let i = boards.length - 1; i >= 0; i--) {
        boards[i].members = boards[i].members?.filter(id => users.has(id)) || [];
        if (!boards[i].members.length) {
            boards.splice(i, 1);
        }
    }
}

io.on('connection', (socket) => {
    // Assign random color to new user
    const color = colors[Math.floor(Math.random() * colors.length)];
    users.set(socket.id, {
        id: socket.id,
        color: color,
        cursor: { x: 0, y: 0 },
        username: `User-${socket.id.slice(0, 5)}`
    });

    console.log(`User connected: ${socket.id} with color ${color}`);

    // Send user list and board state to new user
    socket.emit('user:connected', {
        userId: socket.id,
        color: color,
        allUsers: Array.from(users.values()),
        boards: boards
    });

    // Broadcast new user to everyone
    io.emit('user:joined', {
        userId: socket.id,
        color: color,
        username: users.get(socket.id).username
    });

    // Handle cursor movement
    socket.on('cursor:move', (data) => {
        const user = users.get(socket.id);
        if (user) {
            user.cursor = data;
            socket.broadcast.emit('cursor:update', {
                userId: socket.id,
                x: data.x,
                y: data.y,
                color: user.color,
                username: user.username
            });
        }
    });

    // Allow clients to set their username
    socket.on('user:setName', (data) => {
        const name = (data && data.name) ? String(data.name).slice(0, 64) : null;
        if (name && users.has(socket.id)) {
            const u = users.get(socket.id);
            u.username = name;
            users.set(socket.id, u);
            io.emit('user:updated', { userId: socket.id, username: name });
        }
    });

    // Handle piece drag
    socket.on('piece:drag', (data) => {
        socket.broadcast.emit('piece:drag', {
            userId: socket.id,
            pieceId: data.pieceId,
            x: data.x,
            y: data.y,
            color: users.get(socket.id).color
        });
    });

    // Handle piece create
    socket.on('piece:create', (data) => {
        socket.broadcast.emit('piece:create', Object.assign({}, data, { userId: socket.id }));
    });

    // Handle piece remove
    socket.on('piece:remove', (data) => {
        socket.broadcast.emit('piece:remove', Object.assign({}, data, { userId: socket.id }));
    });

    // Handle piece update (size/rotation/opacity/zIndex/label)
    socket.on('piece:update', (data) => {
        socket.broadcast.emit('piece:update', Object.assign({}, data, { userId: socket.id }));
    });

    // Handle dice roll result
    socket.on('dice:roll', (data) => {
        socket.broadcast.emit('dice:roll', Object.assign({}, data, {
            userId: socket.id,
            username: users.get(socket.id)?.username || 'User'
        }));
    });

    // Handle piece click/select
    socket.on('piece:select', (data) => {
        socket.broadcast.emit('piece:select', {
            userId: socket.id,
            pieceId: data.pieceId,
            color: users.get(socket.id).color,
            username: users.get(socket.id).username
        });
    });

    // Handle board changes
    socket.on('board:update', (data) => {
        socket.broadcast.emit('board:update', {
            userId: socket.id,
            update: data
        });
    });

    // Lobby: create a board
    socket.on('lobby:createBoard', (data) => {
        const id = data.id || ('board-' + Date.now());
        const name = data.name || ('Board ' + Date.now());
        const board = { id, name, owner: socket.id, members: [socket.id] };
        boards.push(board);
        broadcastBoards();
        console.log(`Board created: ${name} (${id}) by ${socket.id}`);
    });

    // Lobby: user join request (host requests user join to a board)
    socket.on('lobby:joinBoard', (data) => {
        // data: { boardId, targetUserId }
        const targetId = data.targetUserId;
        const boardId = data.boardId;
        const targetUser = users.get(targetId);
        const board = boards.find(b => b.id === boardId);
        if (!board) return;
        if (!board.members) board.members = [];
        if (!board.members.includes(targetId)) board.members.push(targetId);
        broadcastBoards();
        const payload = {
            userId: targetId,
            boardId: boardId,
            username: targetUser ? targetUser.username : `User-${targetId.slice(0,5)}`,
            color: targetUser ? targetUser.color : '#888'
        };
        if (board.owner && board.owner !== targetId) {
            io.to(board.owner).emit('lobby:userJoinedBoard', { ...payload, target: 'host', boardData: board.data || null });
        }
        if (targetId) {
            io.to(targetId).emit('lobby:userJoinedBoard', { ...payload, target: 'self', boardData: board.data || null });
        }
    });

    // Lobby: player requests to join a board
    socket.on('lobby:requestJoinBoard', (data) => {
        const boardId = data.boardId;
        const board = boards.find(b => b.id === boardId);
        if (!board) return;
        if (!board.members) board.members = [];
        if (!board.members.includes(socket.id)) board.members.push(socket.id);
        broadcastBoards();
        const payload = {
            userId: socket.id,
            boardId: boardId,
            username: users.get(socket.id).username,
            color: users.get(socket.id).color
        };
        if (board.owner && board.owner !== socket.id) {
            io.to(board.owner).emit('lobby:boardJoined', { ...payload, target: 'host', boardData: board.data || null });
        }
        socket.emit('lobby:boardJoined', { ...payload, target: 'self', boardData: board.data || null });
    });

    // Lobby: leave board
    socket.on('lobby:leaveBoard', (data) => {
        const boardId = data && data.boardId;
        const board = boards.find(b => b.id === boardId);
        if (!board) return;
        // remove member
        board.members = board.members?.filter(id => id !== socket.id) || [];
        // if owner left, end session: notify all members and delete board
        if (board.owner === socket.id) {
            const members = board.members.slice();
            // notify all connected members that lobby ended
            members.forEach(mId => {
                io.to(mId).emit('lobby:ended', { boardId: board.id });
            });
            // also notify owner (self)
            socket.emit('lobby:ended', { boardId: board.id });
            // remove board
            const idx = boards.findIndex(b => b.id === board.id);
            if (idx >= 0) boards.splice(idx, 1);
            broadcastBoards();
            return;
        }
        // otherwise just broadcast updated boards
        broadcastBoards();
        // notify owner and others
        if (board.owner) io.to(board.owner).emit('lobby:memberLeft', { boardId: board.id, userId: socket.id });
    });

    // Lobby: host publishes full board data (layout/config)
    socket.on('lobby:publishBoard', (data) => {
        // data: { boardId, boardData }
        if (!data || !data.boardId) return;
        const board = boards.find(b => b.id === data.boardId);
        if (!board) return;
        // Only the owner may publish (best-effort)
        if (board.owner && board.owner !== socket.id) return;
        board.data = data.boardData || null;
        broadcastBoards();
        // send the published board data to all current members so they can load it immediately
        try {
            (board.members || []).forEach(memberId => {
                // avoid sending the published payload back to the owner (prevents publish->receive loops)
                if (board.owner && memberId === board.owner) return;
                try {
                    io.to(memberId).emit('lobby:boardPublished', { boardId: board.id, boardData: board.data });
                } catch (e) {
                    // ignore per-member errors
                }
            });
        } catch (e) {
            // ignore
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        users.delete(socket.id);
        cleanupDisconnectedBoards();
        broadcastBoards();
        console.log(`User disconnected: ${socket.id}`);
        
        io.emit('user:left', {
            userId: socket.id,
            username: user ? user.username : 'Unknown'
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Tabletopia server running on http://localhost:${PORT}`);
});
