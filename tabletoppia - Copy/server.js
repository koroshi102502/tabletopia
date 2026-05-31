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
const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#ABEBC6'
];

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
        allUsers: Array.from(users.values())
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

    // Handle disconnect
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        users.delete(socket.id);
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
