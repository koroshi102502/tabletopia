
        const stage = document.getElementById('stage');
        const stageInner = document.createElement('div');
        stageInner.className = 'stage-inner';
        stage.appendChild(stageInner);
        
        // ============ COLLABORATION: Socket.io Setup ============
        let socket = null;
        let userId = null;
        let userColor = null;
        let displayName = null;
        let boardNeedsSave = false;
        const remoteUsers = new Map();
        const remoteCursors = new Map();
        
        function setDisplayName(name) {
            if (!name) return;
            displayName = name.trim();
            localStorage.setItem('tabletopiaUsername', displayName);
            if (socket && socket.connected) {
                socket.emit('user:setName', { name: displayName });
            }
        }

        function maybeRequestName() {
            if (displayName) return;
            setTimeout(() => {
                try {
                    const name = prompt('Enter your display name', `User-${userId.slice(0,5)}`);
                    if (name && name.trim()) {
                        setDisplayName(name);
                    }
                } catch (e) {
                    // ignore (prompt may be blocked in some contexts)
                }
            }, 200);
        }

        // Try to connect to WebSocket server
        if (typeof io !== 'undefined') {
            socket = io();
            
            socket.on('user:connected', (data) => {
                userId = data.userId;
                userColor = data.color;
                console.log(`Connected as ${userId} with color ${userColor}`);
                
                // Populate user list and lobby players
                remoteUsers.clear();
                if (Array.isArray(data.allUsers)) {
                    data.allUsers.forEach(u => {
                        remoteUsers.set(u.userId, {
                            id: u.userId,
                            color: u.color,
                            username: u.username
                        });
                    });
                }
                updateUserList(Array.from(remoteUsers.values()));

                // receive known boards from server
                lobbyBoards.length = 0;
                if (Array.isArray(data.boards)) {
                    data.boards.forEach(b => lobbyBoards.push(b));
                }
                updateLobbyBoards(lobbyBoards);
                showCollabToast(`Connected! Your color: ${userColor}`);

                if (!displayName) {
                    displayName = localStorage.getItem('tabletopiaUsername');
                }
                if (displayName) {
                    setDisplayName(displayName);
                } else {
                    maybeRequestName();
                }
            });

            socket.on('lobby:boards', (boardsFromServer) => {
                lobbyBoards.length = 0;
                if (Array.isArray(boardsFromServer)) boardsFromServer.forEach(b => lobbyBoards.push(b));
                updateLobbyBoards(lobbyBoards);
                // If we're currently on a board, and server provided updated data for it, reload
                if (typeof currentBoardId !== 'undefined' && currentBoardId) {
                    const current = lobbyBoards.find(b => b.id === currentBoardId);
                    if (current && current.data) {
                        try { showLoading('Loading board...'); } catch(e){}
                        try { loadLayout(current.data); } finally { try { hideLoading(); } catch(e){} }
                    }
                }
            });

            socket.on('lobby:boardJoined', (data) => {
                if (data.userId === userId && data.target === 'self') {
                    showCollabToast(`You joined board ${data.boardId}`);
                    // load board data if provided
                    if (data.boardData) {
                        currentBoardId = data.boardId;
                        try { showLoading('Downloading board...'); } catch(e){}
                        try { loadLayout(data.boardData); } finally { try { hideLoading(); } catch(e){} }
                    }
                    return;
                }
                if (data.target === 'host') {
                    const username = data.username || `User-${data.userId?.slice?.(0,5)}`;
                    showCollabToast(`${username} joined board ${data.boardId}`);
                }
            });

            socket.on('lobby:ended', (data) => {
                if (!data || !data.boardId) return;
                // if this client was viewing the board, close it
                if (currentBoardId === data.boardId || lastCreatedBoardId === data.boardId) {
                    // clear UI and reset
                    if (playMode) exitPlayMode();
                    clearBoard();
                    showCollabToast('Lobby ended by host');
                }
            });

            socket.on('lobby:memberLeft', (data) => {
                if (!data) return;
                showCollabToast(`A player left lobby ${data.boardId}`);
            });

            socket.on('lobby:userJoinedBoard', (data) => {
                if (data.userId === userId) {
                    showCollabToast(`You were added to board ${data.boardId}`);
                    if (data.boardData) {
                        currentBoardId = data.boardId;
                        try { showLoading('Downloading board...'); } catch(e){}
                        try { loadLayout(data.boardData); } finally { try { hideLoading(); } catch(e){} }
                    }
                    return;
                }
                if (data.target === 'host') {
                    const username = data.username || `User-${data.userId?.slice?.(0,5)}`;
                    const token = createPiece('token', username + "'s token", null);
                    token.style.width = '48px';
                    token.style.height = '48px';
                    token.style.left = (20 + Math.random() * 200) + 'px';
                    token.style.top = (20 + Math.random() * 200) + 'px';
                    token.dataset.owner = data.userId;
                    if (data.color) {
                        const dot = document.createElement('div');
                        dot.style.width = '12px';
                        dot.style.height = '12px';
                        dot.style.borderRadius = '50%';
                        dot.style.background = data.color;
                        dot.style.position = 'absolute';
                        dot.style.right = '6px';
                        dot.style.top = '6px';
                        token.appendChild(dot);
                    }
                    showCollabToast(`${username} joined board ${data.boardId}`);
                }
            });
            
            socket.on('user:joined', (data) => {
                remoteUsers.set(data.userId, {
                    id: data.userId,
                    color: data.color,
                    username: data.username
                });
                updateUserList(Array.from(remoteUsers.values()));
                showCollabToast(`${data.username} joined!`);
            });

            socket.on('user:updated', (data) => {
                // update username change
                const u = remoteUsers.get(data.userId) || { id: data.userId };
                u.username = data.username;
                remoteUsers.set(data.userId, u);
                updateUserList(Array.from(remoteUsers.values()));
            });
            
            socket.on('user:left', (data) => {
                remoteUsers.delete(data.userId);
                removeCursor(data.userId);
                showCollabToast(`${data.username} left.`);
            });
            
            socket.on('cursor:update', (data) => {
                showRemoteCursor(data);
            });
            
            socket.on('piece:drag', (data) => {
                // Apply remote piece position updates
                try {
                    const selector = `[data-entry-id="${data.pieceId}"]`;
                    const piece = document.querySelector(selector);
                    if (piece) {
                        piece.style.left = data.x;
                        piece.style.top = data.y;
                    }
                } catch (e) { /* ignore */ }
            });

            socket.on('piece:create', (data) => {
                try {
                    if (!data || !data.entryId) return;
                    // don't create if we already have it
                    if (document.querySelector(`[data-entry-id="${data.entryId}"]`)) return;
                    const p = createPiece(data.type, data.label, data.image, data.sides, data.entryId, data.stackId, data.stackIndex);
                    if (data.left) p.style.left = data.left;
                    if (data.top) p.style.top = data.top;
                    if (data.width) p.style.width = data.width;
                    if (data.height) p.style.height = data.height;
                    p.dataset.rotation = data.rotation || '0';
                    p.style.transform = `rotate(${p.dataset.rotation}deg)`;
                    if (data.opacity) p.style.opacity = data.opacity;
                    if (data.zIndex) p.style.zIndex = data.zIndex;
                    if (data.diceValue && p.dataset.type === 'dice') {
                        const valueEl = p.querySelector('.dice-value');
                        if (valueEl) valueEl.textContent = data.diceValue;
                    }
                } catch (e) { }
            });

            socket.on('piece:remove', (data) => {
                try {
                    if (!data || !data.entryId) return;
                    const el = document.querySelector(`[data-entry-id="${data.entryId}"]`);
                    if (el) {
                        const entry = document.getElementById(el.dataset.entryId);
                        if (entry) entry.remove();
                        el.remove();
                    }
                } catch (e) { }
            });

            socket.on('piece:update', (data) => {
                try {
                    if (!data || !data.entryId) return;
                    const el = document.querySelector(`[data-entry-id="${data.entryId}"]`);
                    if (!el) return;
                    if (data.left) el.style.left = data.left;
                    if (data.top) el.style.top = data.top;
                    if (data.width) el.style.width = data.width;
                    if (data.height) el.style.height = data.height;
                    if (data.rotation) { el.dataset.rotation = data.rotation; el.style.transform = `rotate(${data.rotation}deg)`; }
                    if (data.opacity) el.style.opacity = data.opacity;
                    if (data.zIndex) el.style.zIndex = data.zIndex;
                    if (data.label) {
                        el.dataset.label = data.label;
                        const entry = document.getElementById(el.dataset.entryId);
                        if (entry) entry.textContent = data.label;
                    }
                } catch (e) { }
            });

            socket.on('dice:roll', (data) => {
                try {
                    if (!data || !data.entryId) return;
                    const el = document.querySelector(`[data-entry-id="${data.entryId}"]`);
                    if (!el || el.dataset.type !== 'dice') return;
                    const valueEl = el.querySelector('.dice-value');
                    if (valueEl) {
                        valueEl.textContent = data.diceValue;
                    }
                } catch (e) { }
            });

            socket.on('board:update', (data) => {
                if (!data || !data.update) return;
                const username = remoteUsers.get(data.userId)?.username || data.username || `User-${data.userId?.slice?.(0,5)}`;
                if (data.update.message) {
                    showCollabToast(`${username}: ${data.update.message}`);
                }
            });
            
            socket.on('piece:select', (data) => {
                // Show which piece user selected
            });
        } else {
            console.warn('Socket.io not available - running in offline mode');
        }
        
        function updateUserList(users) {
            const userListEl = document.getElementById('userList');
            if (!userListEl) return;
            
            userListEl.innerHTML = '';
            users.forEach(user => {
                const badge = document.createElement('div');
                badge.className = 'user-badge';
                badge.innerHTML = `
                    <div class="user-color-dot" style="background-color: ${user.color}"></div>
                    <span>${user.username || 'User'}</span>
                `;
                userListEl.appendChild(badge);
            });
            updateLobbyUsers(users);
        }
        
        function showRemoteCursor(data) {
            const container = document.getElementById('remoteCursorsContainer');
            if (!container) return;
            
            let cursor = remoteCursors.get(data.userId);
            if (!cursor) {
                cursor = document.createElement('div');
                cursor.className = 'remote-cursor';
                cursor.id = `cursor-${data.userId}`;
                container.appendChild(cursor);
                remoteCursors.set(data.userId, cursor);
            }
            
            cursor.style.left = data.x + 'px';
            cursor.style.top = data.y + 'px';
            cursor.innerHTML = `
                <div class="remote-cursor-label">${data.username || 'User'}</div>
                <div class="remote-cursor-arrow" style="border-top-color: ${data.color}"></div>
            `;
        }
        
        function removeCursor(userId) {
            const cursor = remoteCursors.get(userId);
            if (cursor) {
                cursor.remove();
                remoteCursors.delete(userId);
            }
        }
        
        function showCollabToast(message) {
            const toast = document.createElement('div');
            toast.className = 'collab-toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.add('remove');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        const lobbyBoards = [];
        let selectedLobbyInvite = null;
        let currentBoardId = null;
        let lastCreatedBoardId = null;

        function getBoardMemberCount(board) {
            return Array.isArray(board.members) ? board.members.length : 0;
        }

        function isBoardMember(board) {
            return Array.isArray(board.members) && board.members.includes(userId);
        }

        function isBoardOwner(board) {
            return board.owner === userId;
        }

        function openLobbyPage() {
            if (lobbyPanel) lobbyPanel.classList.remove('hidden');
            document.body.classList.add('lobby-visible');
            updateLobbyBoards(lobbyBoards);
            updateLobbyUsers(Array.from(remoteUsers.values()));
            // show leave button while in lobby
            const leaveBtn = document.getElementById('leaveLobbyBtn');
            if (leaveBtn) leaveBtn.classList.remove('hidden');
        }

        function closeLobbyPage() {
            if (lobbyPanel) lobbyPanel.classList.add('hidden');
            document.body.classList.remove('lobby-visible');
            closeLobbyConfirm();
            const leaveBtn = document.getElementById('leaveLobbyBtn');
            if (leaveBtn) leaveBtn.classList.add('hidden');
        }

        function updateLobbyBoards(boards) {
            if (!lobbyBoardsWrap) return;
            lobbyBoardsWrap.innerHTML = '';
            if (!boards.length) {
                lobbyBoardsWrap.innerHTML = '<div class="lobby-empty">No boards yet. Create one to invite players.</div>';
                updateLobbyUsers(Array.from(remoteUsers.values()));
                return;
            }

            boards.forEach(board => {
                const memberCount = getBoardMemberCount(board);
                const owner = board.owner === userId;
                const joined = isBoardMember(board);
                const row = document.createElement('div');
                row.className = 'lobby-board-row';

                const details = document.createElement('div');
                details.className = 'lobby-board-details';
                details.innerHTML = `
                    <div class="board-main">
                        <strong>${board.name}</strong>
                        <span class="board-meta-text">${board.id}</span>
                    </div>
                    <div class="board-status-label">Players: ${memberCount}</div>
                `;
                row.appendChild(details);

                const actions = document.createElement('div');
                actions.className = 'lobby-board-actions';

                if (!joined) {
                    const joinBtn = document.createElement('button');
                    joinBtn.type = 'button';
                    joinBtn.className = 'lobby-join-btn';
                    joinBtn.textContent = 'Join lobby';
                    joinBtn.addEventListener('click', () => lobbyRequestJoinBoard(board.id));
                    actions.appendChild(joinBtn);
                } else {
                    const label = document.createElement('span');
                    label.className = 'lobby-joined-label';
                    label.textContent = owner ? 'Host' : 'Joined';
                    actions.appendChild(label);
                }

                const soloBtn = document.createElement('button');
                soloBtn.type = 'button';
                soloBtn.className = 'lobby-solo-btn';
                soloBtn.textContent = 'Solo mode';
                soloBtn.addEventListener('click', () => lobbyStartBoard(board.id, true));
                actions.appendChild(soloBtn);

                if (owner) {
                    const startBtn = document.createElement('button');
                    startBtn.type = 'button';
                    startBtn.className = 'lobby-start-btn';
                    startBtn.textContent = 'Start board';
                    startBtn.disabled = memberCount < 2;
                    startBtn.title = memberCount < 2 ? 'Need 2 or more players to start' : 'Start with joined players';
                    startBtn.addEventListener('click', () => lobbyStartBoard(board.id, false));
                    actions.appendChild(startBtn);
                }

                row.appendChild(actions);
                lobbyBoardsWrap.appendChild(row);
            });
            updateLobbyUsers(Array.from(remoteUsers.values()));
        }

        function lobbyRequestJoinBoard(boardId) {
            if (!socket || !socket.connected) {
                showCollabToast('Cannot join lobby while offline.');
                return;
            }
            socket.emit('lobby:requestJoinBoard', { boardId });
        }

        // Leave current board/lobby
        function lobbyLeaveBoard(boardId) {
            if (!boardId) boardId = currentBoardId || lastCreatedBoardId;
            if (!boardId) return;
            if (socket && socket.connected) socket.emit('lobby:leaveBoard', { boardId });
            // cleanup local state
            // close play if active
            if (playMode) exitPlayMode();
            // clear UI and reset
            clearBoard();
            closeLobbyPage();
            showCollabToast('Left lobby');
        }

        function getCurrentLayout() {
            const pieces = Array.from(stage.querySelectorAll('.piece')).map(piece => ({
                entryId: piece.dataset.entryId,
                stackId: piece.dataset.stackId || null,
                stackIndex: piece.dataset.stackIndex ? parseInt(piece.dataset.stackIndex, 10) : null,
                type: piece.dataset.type,
                label: piece.dataset.label,
                left: piece.style.left,
                top: piece.style.top,
                width: piece.style.width,
                height: piece.style.height,
                rotation: piece.dataset.rotation || '0',
                opacity: piece.style.opacity,
                zIndex: piece.style.zIndex,
                image: piece.querySelector('img')?.src || null,
                sides: piece.dataset.sides || null,
                diceValue: piece.querySelector('.dice-value')?.textContent || null
            }));
            return {
                boardColor: boardColor.value,
                hasBackgroundImage: stageInner.style.backgroundImage !== 'none',
                boardBackground: stageInner.style.backgroundImage ? stageInner.style.backgroundImage.slice(5, -2) : null,
                pieces
            };
        }

        function lobbyPublishBoard(boardId) {
            if (!socket || !socket.connected) return;
            if (!boardId) return;
            const data = getCurrentLayout();
            socket.emit('lobby:publishBoard', { boardId, boardData: data });
        }

        function lobbyStartBoard(boardId, soloMode = false) {
            const board = lobbyBoards.find(b => b.id === boardId);
            if (!board) {
                showCollabToast('Board not found.');
                return;
            }
            const memberCount = getBoardMemberCount(board);
            if (!soloMode && memberCount < 2) {
                showCollabToast('You must wait for 2 or more players before starting.');
                return;
            }
            closeLobbyPage();
            if (!playMode) enterPlayMode();
            showCollabToast(soloMode ? 'Started solo mode' : `Started board "${board.name}" with ${memberCount} player(s)`);
        }

        function updateLobbyUsers(users) {
            if (!lobbyPlayersWrap) return;
            lobbyPlayersWrap.innerHTML = '';
            if (!users.length) {
                lobbyPlayersWrap.innerHTML = '<div class="lobby-empty">No players connected yet.</div>';
                return;
            }
            users.forEach(user => {
                const row = document.createElement('div');
                row.className = 'lobby-player-row';
                const name = user.id === userId ? 'You' : (user.username || 'User');
                const meta = document.createElement('div');
                meta.className = 'player-meta';
                meta.innerHTML = `
                    <span class="user-color-dot" style="background:${user.color || '#888'}"></span>
                    <span class="player-name">${name}</span>
                `;
                row.appendChild(meta);

                if (user.id !== userId) {
                    const chooser = document.createElement('select');
                    chooser.className = 'lobby-board-select';
                    if (!lobbyBoards.length) {
                        const emptyOption = document.createElement('option');
                        emptyOption.textContent = 'No boards available';
                        chooser.appendChild(emptyOption);
                        chooser.disabled = true;
                    } else {
                        lobbyBoards.forEach(board => {
                            const opt = document.createElement('option');
                            opt.value = board.id;
                            opt.textContent = board.name;
                            chooser.appendChild(opt);
                        });
                    }

                    const inviteButton = document.createElement('button');
                    inviteButton.type = 'button';
                    inviteButton.className = 'lobby-invite-btn';
                    inviteButton.textContent = 'Invite';
                    inviteButton.disabled = !lobbyBoards.length;
                    inviteButton.addEventListener('click', () => {
                        openLobbyConfirm(user, chooser.value);
                    });

                    row.appendChild(chooser);
                    row.appendChild(inviteButton);
                } else {
                    const label = document.createElement('span');
                    label.className = 'lobby-self-label';
                    label.textContent = '(This session)';
                    row.appendChild(label);
                }

                lobbyPlayersWrap.appendChild(row);
            });
        }

        function onCreateBoardClick() {
            const name = prompt('Board name') || `Board ${Date.now()}`;
            const board = { id: 'board-' + Date.now(), name, owner: userId, members: [userId] };
            lobbyBoards.push(board);
            lastCreatedBoardId = board.id;
            // publish initial board layout
            if (socket && socket.connected) {
                socket.emit('lobby:createBoard', board);
                setTimeout(() => {
                    lobbyPublishBoard(board.id);
                }, 250);
            }
            updateLobbyBoards(lobbyBoards);
            showCollabToast(`Created board "${board.name}"`);
            // Ask user to import a layout for this new board
            const file = prompt('If you have a layout file path paste it here, otherwise press Cancel to pick a file manually');
            // We will open the import file picker instead of relying on path
            importFileInput.click();
            importFileInput.onchange = (event) => {
                const f = event.target.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const config = JSON.parse(reader.result);
                        // load locally
                        loadLayout(config);
                        // publish to server as board data
                        if (socket && socket.connected) {
                            socket.emit('lobby:createBoard', board);
                            setTimeout(() => lobbyPublishBoard(board.id), 200);
                        }
                        showCollabToast('Imported layout and published to lobby');
                        // clear input handler
                        importFileInput.onchange = null;
                        importFileInput.value = '';
                    } catch (err) {
                        alert('Invalid layout file: ' + err.message);
                    }
                };
                reader.readAsText(f);
            };
        }

        function openLobbyConfirm(user, boardId) {
            const board = lobbyBoards.find(b => b.id === boardId);
            if (!board) {
                showCollabToast('Please create a board first.');
                return;
            }
            selectedLobbyInvite = { user, board };
            if (lobbyConfirmMessage) lobbyConfirmMessage.textContent = `Invite ${user.username || 'User'} to board "${board.name}"?`;
            if (lobbyConfirmModal) lobbyConfirmModal.classList.remove('hidden');
        }

        function closeLobbyConfirm() {
            selectedLobbyInvite = null;
            if (lobbyConfirmModal) lobbyConfirmModal.classList.add('hidden');
        }

        function acceptLobbyInvite() {
            if (!selectedLobbyInvite) return;
            const { user, board } = selectedLobbyInvite;
            if (socket && socket.connected) {
                socket.emit('lobby:joinBoard', {
                    targetUserId: user.id,
                    boardId: board.id
                });
            }
            closeLobbyConfirm();
        }
        
        // Track mouse movement to send cursor position
        let remoteCursorPending = null;
        let remoteCursorRaf = null;

        document.addEventListener('mousemove', (e) => {
            if (socket && socket.connected) {
                remoteCursorPending = { x: e.clientX, y: e.clientY };
                if (!remoteCursorRaf) {
                    remoteCursorRaf = requestAnimationFrame(() => {
                        if (remoteCursorPending && socket && socket.connected) {
                            socket.emit('cursor:move', {
                                x: remoteCursorPending.x,
                                y: remoteCursorPending.y
                            });
                        }
                        remoteCursorPending = null;
                        remoteCursorRaf = null;
                    });
                }
            }
        });
        
        // ============ END COLLABORATION ============
        

        const boardColor = document.getElementById('boardColor');
        const componentType = document.getElementById('componentType');
        const componentName = document.getElementById('componentName');
        const stackCountInput = document.getElementById('stackCountInput');
        const componentImageInput = document.getElementById('componentImageInput');
        const addComponentBtn = document.getElementById('addComponentBtn');
        const saveBoardBtn = document.getElementById('saveBoardBtn');
        const componentList = document.getElementById('componentList');
        const selectedInfo = document.getElementById('selectedInfo');
        const sizeSlider = document.getElementById('sizeSlider');
        const rotateSlider = document.getElementById('rotateSlider');
        const opacitySlider = document.getElementById('opacitySlider');
        const bringFrontBtn = document.getElementById('bringFrontBtn');
        const sendBackBtn = document.getElementById('sendBackBtn');
        const removeComponentBtn = document.getElementById('removeComponentBtn');
        const resetBtn = document.getElementById('resetBtn');
        const exportDataBtn = document.getElementById('exportDataBtn');
        const drawerToggle = document.getElementById('drawerToggle');
        const controlsPanel = document.querySelector('.controls-panel');
        const boardPreviewImage = document.getElementById('boardPreviewImage');
        const boardPreviewNoImage = document.getElementById('boardPreviewNoImage');
        const uiToggleBtn = document.getElementById('uiToggleBtn');
        const playBtn = document.getElementById('playBtn');
        const lobbyBtn = document.getElementById('lobbyBtn');
        const lobbyPanel = document.getElementById('lobbyPanel');
        const closeLobbyBtn = document.getElementById('closeLobbyBtn');
        const lobbyBoardsWrap = document.getElementById('lobbyBoards');
        const lobbyPlayersWrap = document.getElementById('lobbyPlayers');
        const lobbyConfirmModal = document.getElementById('lobbyConfirmModal');
        const lobbyConfirmMessage = document.getElementById('lobbyConfirmMessage');
        const lobbyConfirmAccept = document.getElementById('lobbyConfirmAccept');
        const lobbyConfirmCancel = document.getElementById('lobbyConfirmCancel');
        const lobbyCreateBtn = document.getElementById('lobbyCreateBtn');
        const importDataBtn = document.getElementById('importDataBtn');
        const importFileInput = document.getElementById('importFileInput');
        const restoreBoardBtn = document.getElementById('restoreBoardBtn');

        let playMode = false;
        let playHud = null;
        // When true the user intentionally allowed exiting play (via ESC)
        let allowExit = false;
        const diceSidesSelect = document.getElementById('diceSidesSelect');
        const diceSidesGroup = document.getElementById('diceSidesGroup');
        let panState = { active: false, startX: 0, startY: 0, translateX: 0, translateY: 0 };
        let zoomLevel = 1;

        let selectedPiece = null;
        let dragState = null;
        let lastLoadedConfig = null;

        function setBoardDirty(isDirty) {
            boardNeedsSave = Boolean(isDirty);
            if (saveBoardBtn) saveBoardBtn.disabled = !boardNeedsSave;
        }

        function isBoardBeingEdited() {
            return Boolean((currentBoardId || lastCreatedBoardId) && !playMode);
        }

        function boardSaveSummary() {
            if (!saveBoardBtn) return;
            if (boardNeedsSave) {
                saveBoardBtn.textContent = 'Save board';
                saveBoardBtn.classList.remove('saved');
            } else {
                saveBoardBtn.textContent = 'Save board';
                saveBoardBtn.classList.add('saved');
            }
        }

        function showLoading(message) {
            let overlay = document.getElementById('loadingOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'loadingOverlay';
                overlay.className = 'loading-overlay';
                overlay.innerHTML = `<div class="spinner"></div><div class="loading-message"></div>`;
                document.body.appendChild(overlay);
            }
            overlay.querySelector('.loading-message').textContent = message || 'Loading...';
            overlay.style.display = 'flex';
        }

        function hideLoading() {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) overlay.style.display = 'none';
        }
        let zIndexCounter = 1;
        const selectedDiceSidesWrap = document.getElementById('selectedDiceSidesWrap');
        const selectedDiceSides = document.getElementById('selectedDiceSides');

        function applyBoardStyles() {
            stageInner.style.backgroundColor = boardColor.value;
        }

        boardColor.addEventListener('input', applyBoardStyles);

        boardImageInput.addEventListener('change', event => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                stageInner.style.backgroundImage = `url('${reader.result}')`;
                stageInner.style.backgroundSize = 'cover';
                stageInner.style.backgroundPosition = 'center';
                boardPreviewImage.src = reader.result;
                boardPreviewImage.style.display = 'block';
                boardPreviewNoImage.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });

        // populate dice sides dropdown (2..100)
        for (let i = 2; i <= 100; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `${i} sides`;
            diceSidesSelect.appendChild(opt);
        }
        // default
        diceSidesSelect.value = '6';
        // populate selected-dice dropdown too
        for (let i = 2; i <= 100; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `${i} sides`;
            selectedDiceSides.appendChild(opt);
        }
        selectedDiceSides.value = '6';

        // toggle image input vs dice sides when component type changes
        componentType.addEventListener('change', () => {
            const isDice = componentType.value === 'dice';
            diceSidesGroup.style.display = isDice ? 'block' : 'none';
            componentImageInput.parentElement.style.display = isDice ? 'none' : 'block';
        });

        drawerToggle.addEventListener('click', () => {
            controlsPanel.classList.toggle('closed');
        });

        uiToggleBtn.addEventListener('click', () => {
            const hidden = document.body.classList.toggle('hide-ui');
            uiToggleBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
            uiToggleBtn.textContent = hidden ? 'Show UI' : 'Hide UI';
        });

        playBtn.addEventListener('click', () => {
            if (!playMode) enterPlayMode(); else exitPlayMode();
        });

        if (lobbyBtn) lobbyBtn.addEventListener('click', openLobbyPage);
        if (closeLobbyBtn) closeLobbyBtn.addEventListener('click', closeLobbyPage);
        if (lobbyConfirmAccept) lobbyConfirmAccept.addEventListener('click', acceptLobbyInvite);
        if (lobbyConfirmCancel) lobbyConfirmCancel.addEventListener('click', closeLobbyConfirm);
        const changeNameBtn = document.getElementById('changeNameBtn');
        if (lobbyCreateBtn) lobbyCreateBtn.addEventListener('click', onCreateBoardClick);
        if (changeNameBtn) changeNameBtn.addEventListener('click', () => {
            const name = prompt('Change display name', displayName || '');
            if (name && name.trim()) {
                setDisplayName(name.trim());
                showCollabToast('Name updated');
            }
        });

        // Import layout flow
        importDataBtn.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', event => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const config = JSON.parse(reader.result);
                    loadLayout(config);
                } catch (err) {
                    alert('Invalid layout file: ' + err.message);
                }
            };
            reader.readAsText(file);
            // clear input so same file can be reselected later
            importFileInput.value = '';
        });

        function loadLayout(config) {
            // keep copy of original loaded data for restore
            try {
                lastLoadedConfig = config ? JSON.parse(JSON.stringify(config)) : null;
            } catch (e) {
                lastLoadedConfig = config || null;
            }
            if (lastLoadedConfig && typeof restoreBoardBtn !== 'undefined' && restoreBoardBtn) {
                restoreBoardBtn.disabled = false;
            }
            // mark board as needing save (unless we're just loading from server)
            // if we are currently the owner of a created board, auto-publish so joiners receive the layout
            try {
                const ownerBoardId = lastCreatedBoardId || currentBoardId;
                if (ownerBoardId && socket && socket.connected) {
                    // publish current layout to server so other players can access it
                    lobbyPublishBoard(ownerBoardId);
                    showCollabToast('Published layout to lobby');
                }
            } catch (e) {
                // ignore publish errors
            }
            // apply board color
            if (config.boardColor) {
                boardColor.value = config.boardColor;
                applyBoardStyles();
            }
            // apply board background
            if (config.boardBackground) {
                stageInner.style.backgroundImage = `url('${config.boardBackground}')`;
                stageInner.style.backgroundSize = 'cover';
                stageInner.style.backgroundPosition = 'center';
                boardPreviewImage.src = config.boardBackground;
                boardPreviewImage.style.display = 'block';
                boardPreviewNoImage.style.display = 'none';
            } else {
                stageInner.style.backgroundImage = 'none';
                boardPreviewImage.src = '';
                boardPreviewImage.style.display = 'none';
                boardPreviewNoImage.style.display = 'block';
            }

            // clear existing pieces and list
            stageInner.querySelectorAll('.piece').forEach(piece => {
                const entry = document.getElementById(piece.dataset.entryId);
                if (entry) entry.remove();
                piece.remove();
            });
            componentList.innerHTML = '';

            // recreate pieces
                if (Array.isArray(config.pieces)) {
                config.pieces.forEach(p => {
                                const piece = createPiece(p.type, p.label, p.image, p.sides, p.entryId, p.stackId, p.stackIndex);
                    // restore transform/position/size
                    if (p.left) piece.style.left = p.left;
                    if (p.top) piece.style.top = p.top;
                    if (p.width) piece.style.width = p.width;
                    if (p.height) piece.style.height = p.height;
                    const rotation = p.rotation || '0';
                    piece.dataset.rotation = rotation;
                    piece.style.transform = `rotate(${rotation}deg)`;
                    if (p.opacity) piece.style.opacity = p.opacity;
                    if (p.zIndex) piece.style.zIndex = p.zIndex;
                    if (p.diceValue && piece.dataset.type === 'dice') {
                        const valueEl = piece.querySelector('.dice-value');
                        if (valueEl) valueEl.textContent = p.diceValue;
                    }
                });
            }
        }

        function clearBoard() {
            // remove pieces from DOM and component list
            stageInner.querySelectorAll('.piece').forEach(piece => piece.remove());
            componentList.innerHTML = '';
            selectedPiece = null;
            selectPiece(null);
            // reset board visuals
            stageInner.style.backgroundImage = 'none';
            boardPreviewImage.src = '';
            boardPreviewImage.style.display = 'none';
            boardPreviewNoImage.style.display = 'block';
            boardColor.value = '#3a5f58';
            applyBoardStyles();
            currentBoardId = null;
            lastCreatedBoardId = null;
            setBoardDirty(false);
            if (saveBoardBtn) saveBoardBtn.disabled = true;
            if (typeof restoreBoardBtn !== 'undefined' && restoreBoardBtn) restoreBoardBtn.disabled = true;
            lastLoadedConfig = null;
        }

        function enterPlayMode() {
            playMode = true;
            document.body.classList.add('play-mode');
            playBtn.textContent = 'Stop';
            // disable creation inputs
            [boardImageInput, componentImageInput, addComponentBtn, componentType, componentName, sizeSlider, rotateSlider, opacitySlider, bringFrontBtn, sendBackBtn, removeComponentBtn].forEach(el => { if (el) el.disabled = true; });
            // Try to enter native fullscreen on the stage element.
            // Keep track whether the user intentionally exits via ESC using `allowExit`.
            allowExit = false;
            if (stage.requestFullscreen) {
                stage.requestFullscreen().catch(() => {/* ignore if blocked */});
            }
            // reset transforms
            panState = { active: false, startX: 0, startY: 0, translateX: 0, translateY: 0 };
            zoomLevel = 1;
            updateStageTransform();
            // add small HUD
            playHud = document.createElement('div');
            playHud.className = 'play-hud';
            playHud.innerHTML = 'Play mode — drag empty board to pan, scroll up/down to zoom, Esc to exit.';
            document.body.appendChild(playHud);
            document.addEventListener('keydown', escKeyHandler);
            document.addEventListener('fullscreenchange', fullscreenChangeHandler);
        }

        function updateStageTransform() {
            stageInner.style.transform = `translate(${panState.translateX}px, ${panState.translateY}px) scale(${zoomLevel})`;
        }

        // Shift pan + scroll zoom
        document.addEventListener('keydown', event => {
            if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && playMode && !panState.active) {
                event.preventDefault();
                panState.active = true;
                stage.classList.add('panning');
            }
        });

        document.addEventListener('keyup', event => {
            if ((event.code === 'ShiftLeft' || event.code === 'ShiftRight') && panState.active) {
                panState.active = false;
                stage.classList.remove('panning');
            }
        });

        // Left-click drag on empty board to pan (in play mode)
        stage.addEventListener('pointerdown', event => {
            if (!playMode || event.button !== 0) return;
            if (event.target !== stage && event.target !== stageInner) return; // only pan if clicking empty board, not a piece
            event.preventDefault();
            panState.active = true;
            stage.classList.add('panning');
            panState.lastX = event.clientX;
            panState.lastY = event.clientY;

            function pointerMove(moveEvent) {
                if (!panState.active) return;
                moveEvent.preventDefault();
                const deltaX = (moveEvent.clientX - panState.lastX) / zoomLevel;
                const deltaY = (moveEvent.clientY - panState.lastY) / zoomLevel;
                panState.translateX += deltaX;
                panState.translateY += deltaY;
                panState.lastX = moveEvent.clientX;
                panState.lastY = moveEvent.clientY;
                updateStageTransform();
            }

            function pointerUp() {
                panState.active = false;
                stage.classList.remove('panning');
                document.removeEventListener('pointermove', pointerMove);
                document.removeEventListener('pointerup', pointerUp);
            }

            document.addEventListener('pointermove', pointerMove);
            document.addEventListener('pointerup', pointerUp);
        });

        document.addEventListener('mousemove', event => {
            if (!playMode || !panState.active) return;
            event.preventDefault();
            // use movementX/movementY for proper relative delta
            if (event.movementX !== undefined && event.movementY !== undefined) {
                panState.translateX += event.movementX / zoomLevel;
                panState.translateY += event.movementY / zoomLevel;
                updateStageTransform();
            }
        });

        function handlePlayModeWheel(event) {
            if (!playMode) return;
            if (!event.target.closest('.stage')) return;
            event.preventDefault();
            const zoomSpeed = 0.1;
            const direction = event.deltaY > 0 ? -1 : 1;
            const oldZoom = zoomLevel;
            const rect = stage.getBoundingClientRect();
            const pointerX = event.clientX - rect.left;
            const pointerY = event.clientY - rect.top;
            zoomLevel = Math.max(0.25, Math.min(4, zoomLevel + direction * zoomSpeed));
            const scaleFactor = 1 / zoomLevel - 1 / oldZoom;
            panState.translateX += pointerX * scaleFactor;
            panState.translateY += pointerY * scaleFactor;
            updateStageTransform();
        }

        document.addEventListener('wheel', handlePlayModeWheel, { passive: false });

        function exitPlayMode() {
            playMode = false;
            document.body.classList.remove('play-mode');
            playBtn.textContent = 'Play';
            [boardImageInput, componentImageInput, addComponentBtn, componentType, componentName, sizeSlider, rotateSlider, opacitySlider, bringFrontBtn, sendBackBtn, removeComponentBtn].forEach(el => { if (el) el.disabled = false; });
            // allow exit and remove listeners
            allowExit = true;
            document.removeEventListener('keydown', escKeyHandler);
            document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
            if (playHud) { playHud.remove(); playHud = null; }
            // ensure editing UI becomes visible when exiting play mode
            document.body.classList.remove('hide-ui');
            // exit native fullscreen if active
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {/* ignore */});
            }
            // reset pan and zoom
            panState = { active: false, startX: 0, startY: 0, translateX: 0, translateY: 0 };
            zoomLevel = 1;
            updateStageTransform();
        }

        // Only allow leaving play mode by pressing Escape.
        function escKeyHandler(e) {
            if (!playMode) return;
            if (e.key === 'Escape') {
                // mark allowed exit, then exit fullscreen and play mode
                allowExit = true;
                // ensure the editor UI will be shown after exit
                document.body.classList.remove('hide-ui');
                if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                exitPlayMode();
            } else {
                // prevent accidental keys from doing other things in play mode
                e.stopPropagation();
            }
        }

        function fullscreenChangeHandler() {
            // If fullscreen was lost and the user didn't intentionally allow exit,
            // treat that as an intent to leave play mode (covers browsers that consume ESC).
            if (!playMode) return;
            if (!document.fullscreenElement && !allowExit) {
                allowExit = true;
                exitPlayMode();
            }
        }

        function rollDice(piece) {
            // If this is the special dice window, show a numeric roll
            if (piece.dataset.type === 'dice') {
                const sides = parseInt(piece.dataset.sides, 10) || 6;
                const valueEl = piece.querySelector('.dice-value');
                if (!valueEl) return;
                // animate fast-changing numbers, then show final
                const duration = 700;
                const start = Date.now();
                piece.classList.add('rolling');
                const tick = setInterval(() => {
                    const now = Date.now();
                    if (now - start >= duration) {
                        clearInterval(tick);
                        const final = Math.floor(Math.random() * sides) + 1;
                        valueEl.textContent = String(final);
                        piece.classList.remove('rolling');
                        if (socket && socket.connected) {
                            socket.emit('dice:roll', {
                                entryId: piece.dataset.entryId,
                                diceValue: String(final)
                            });
                        }
                        if (lastCreatedBoardId && socket && socket.connected) {
                            lobbyPublishBoard(lastCreatedBoardId);
                        }
                    } else {
                        const interim = Math.floor(Math.random() * sides) + 1;
                        valueEl.textContent = String(interim);
                    }
                }, 60);
                // small shake animation
                piece.style.transition = 'transform .6s ease';
                piece.style.transform = 'translateY(-8px) rotate(' + (Math.random() * 20 - 10) + 'deg)';
                setTimeout(() => {
                    piece.style.transform = '';
                    piece.style.transition = '';
                }, 650);
                return;
            }
            // fallback: visual 'roll' for other dice types
            const rx = Math.floor(Math.random() * 720) - 360;
            const tx = Math.floor(Math.random() * 120) - 60;
            const ty = Math.floor(Math.random() * 120) - 60;
            const left = parseFloat(piece.style.left) || 0;
            const top = parseFloat(piece.style.top) || 0;
            piece.style.transition = 'transform .6s ease, left .6s ease, top .6s ease';
            piece.style.transform = `rotate(${rx}deg)`;
            piece.style.left = Math.max(0, Math.min(stage.clientWidth - piece.clientWidth, left + tx)) + 'px';
            piece.style.top = Math.max(0, Math.min(stage.clientHeight - piece.clientHeight, top + ty)) + 'px';
            setTimeout(() => {
                // subtle settle
                piece.style.transform = `rotate(${rx % 360}deg)`;
                piece.style.transition = 'transform .28s ease, left .12s ease, top .12s ease';
            }, 700);
        }

        function rollDicePreview(piece) {
            // quick preview without full play-mode (edit-time preview)
            const sides = parseInt(piece.dataset.sides, 10) || 6;
            const valueEl = piece.querySelector('.dice-value');
            if (!valueEl) return;
            const final = Math.floor(Math.random() * sides) + 1;
            valueEl.textContent = String(final);
        }

        function toggleFlip(piece) {
            piece.classList.toggle('flipped');
        }

        function createPiece(type, label, imageSrc, sides, entryId, stackId, stackIndex) {
            const piece = document.createElement('div');
            piece.className = 'piece piece--' + type;
            piece.dataset.type = type;
            piece.dataset.label = label;
            if (stackId) piece.dataset.stackId = stackId;
            if (stackIndex) piece.dataset.stackIndex = String(stackIndex);
            if (type === 'dice') piece.dataset.sides = String(sides || 6);
            piece.style.width = '100px';
            piece.style.height = type === 'card' ? '140px' : '100px';
            piece.style.left = '80px';
            piece.style.top = '80px';
            piece.style.zIndex = ++zIndexCounter;
            piece.style.opacity = '1';

            const inner = document.createElement('div');
            inner.className = 'piece-inner';

            if (type === 'dice') {
                const value = document.createElement('div');
                value.className = 'dice-value';
                // initial visible placeholder
                value.textContent = '1';
                inner.appendChild(value);

                const rollBtn = document.createElement('button');
                rollBtn.type = 'button';
                rollBtn.className = 'dice-roll-btn';
                rollBtn.textContent = 'Roll the dice';
                inner.appendChild(rollBtn);

                // resizer handle
                const resizer = document.createElement('div');
                resizer.className = 'resizer';
                piece.appendChild(resizer);
                piece.dataset.sides = String(sides || 6);
            } else {
                const title = document.createElement('span');
                title.className = 'piece-title';
                title.textContent = label || type;
                inner.appendChild(title);

                if (imageSrc) {
                    const img = document.createElement('img');
                    img.src = imageSrc;
                    img.alt = label || type;
                    img.className = 'piece-image';
                    inner.appendChild(img);
                    // mark piece as having an image and hide the title
                    piece.classList.add('has-image');
                    title.style.display = 'none';
                }
            }

            piece.appendChild(inner);
            stageInner.appendChild(piece);
            setupPiece(piece);
            const entry = addListEntry(piece, entryId);
            selectPiece(piece);

            // emit piece:create only in play mode; in edit mode board updates happen on explicit save
            if (!entryId && socket && socket.connected && playMode) {
                const payload = {
                    entryId: piece.dataset.entryId,
                    stackId: piece.dataset.stackId || null,
                    stackIndex: piece.dataset.stackIndex ? parseInt(piece.dataset.stackIndex, 10) : null,
                    type: type,
                    label: label,
                    image: imageSrc || null,
                    sides: sides || null,
                    left: piece.style.left,
                    top: piece.style.top,
                    width: piece.style.width,
                    height: piece.style.height,
                    rotation: piece.dataset.rotation || '0',
                    opacity: piece.style.opacity,
                    zIndex: piece.style.zIndex,
                    diceValue: piece.querySelector('.dice-value')?.textContent || null
                };
                socket.emit('piece:create', payload);
            }

            if (isBoardBeingEdited()) {
                setBoardDirty(true);
            }

            return piece;
        }

        function setupPiece(piece) {
            piece.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                // Do not start drag when interacting with controls inside the piece.
                if (event.target.closest('button, input, select, .resizer')) return;
                event.preventDefault();
                // bring to front whenever user picks up a piece
                piece.style.zIndex = ++zIndexCounter;
                selectPiece(piece);
                startDrag(event, piece);
            });
            piece.addEventListener('click', event => {
                event.stopPropagation();
                selectPiece(piece);
            });
            piece.addEventListener('dblclick', event => {
                event.stopPropagation();
                // In play mode double-click flips or rolls dice
                if (playMode) {
                    piece.style.zIndex = ++zIndexCounter;
                    if (piece.dataset.type === 'dice') rollDice(piece);
                    else toggleFlip(piece);
                } else {
                    selectPiece(piece);
                }
            });

            // dice-specific button and resizer wiring
            if (piece.dataset.type === 'dice') {
                const rollBtn = piece.querySelector('.dice-roll-btn');
                const valueEl = piece.querySelector('.dice-value');
                if (rollBtn) {
                    rollBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (playMode) rollDice(piece);
                        else {
                            // in edit mode, allow preview roll
                            rollDicePreview(piece);
                        }
                    });
                }

                // make resizer functional
                const resizer = piece.querySelector('.resizer');
                if (resizer) {
                    resizer.addEventListener('pointerdown', ev => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        const startX = ev.clientX;
                        const startY = ev.clientY;
                        const startW = piece.clientWidth;
                        const startH = piece.clientHeight;

                        function onMove(mv) {
                            const dx = mv.clientX - startX;
                            const dy = mv.clientY - startY;
                            piece.style.width = Math.max(40, startW + dx) + 'px';
                            piece.style.height = Math.max(40, startH + dy) + 'px';
                        }

                        function onUp() {
                            document.removeEventListener('pointermove', onMove);
                            document.removeEventListener('pointerup', onUp);
                        }

                        document.addEventListener('pointermove', onMove);
                        document.addEventListener('pointerup', onUp);
                    });
                }
            }
        }

        function addListEntry(piece, id) {
            const entry = document.createElement('button');
            entry.type = 'button';
            entry.className = 'component-entry';
            entry.textContent = piece.dataset.label;
            entry.addEventListener('click', () => selectPiece(piece));
            entry.id = id || `component-entry-${Date.now()}-${Math.random()}`;
            piece.dataset.entryId = entry.id;
            componentList.appendChild(entry);
            return entry;
        }

        function updateSizeSliderMax(piece) {
            const currentWidth = parseInt(piece.style.width, 10) || 100;
            const stageMax = Math.max(stage.clientWidth, stage.clientHeight) * 3;
            sizeSlider.max = Math.max(20000, currentWidth, stageMax);
        }

        function selectPiece(piece) {
            if (selectedPiece) {
                selectedPiece.classList.remove('piece--selected');
            }
            selectedPiece = piece;
            if (!piece) {
                selectedInfo.textContent = 'No component selected.';
                sizeSlider.disabled = true;
                rotateSlider.disabled = true;
                opacitySlider.disabled = true;
                bringFrontBtn.disabled = true;
                sendBackBtn.disabled = true;
                removeComponentBtn.disabled = true;
                selectedDiceSidesWrap.style.display = 'none';
                return;
            }
            piece.classList.add('piece--selected');
            selectedInfo.textContent = `${piece.dataset.type.toUpperCase()}: ${piece.dataset.label}`;
            sizeSlider.disabled = false;
            rotateSlider.disabled = false;
            opacitySlider.disabled = false;
            bringFrontBtn.disabled = false;
            sendBackBtn.disabled = false;
            removeComponentBtn.disabled = false;
            updateSizeSliderMax(piece);
            sizeSlider.value = parseInt(piece.style.width, 10);
            rotateSlider.value = piece.dataset.rotation || 0;
            opacitySlider.value = Math.round(parseFloat(piece.style.opacity) * 100);

            // ============ COLLABORATION: Broadcast piece selection ============
            if (socket && socket.connected && piece) {
                socket.emit('piece:select', {
                    pieceId: piece.dataset.entryId,
                    pieceName: piece.dataset.label
                });
            }
            // ============ END COLLABORATION ============

            // show selected dice sides control when a dice is selected
            if (piece.dataset.type === 'dice') {
                selectedDiceSidesWrap.style.display = 'block';
                selectedDiceSides.value = piece.dataset.sides || '6';
            } else {
                selectedDiceSidesWrap.style.display = 'none';
            }
        }

        function startDrag(event, piece) {
            const rect = stage.getBoundingClientRect();
            const scale = zoomLevel;
            // Account for zoom and pan when calculating offset
            const offsetX = (event.clientX - rect.left) / scale - panState.translateX - piece.offsetLeft;
            const offsetY = (event.clientY - rect.top) / scale - panState.translateY - piece.offsetTop;
            dragState = { piece, offsetX, offsetY };
            stage.setPointerCapture(event.pointerId);

            let pendingDrag = null;
            let dragRaf = null;

            function sendPendingDrag() {
                if (!pendingDrag || !socket || !socket.connected) {
                    dragRaf = null;
                    return;
                }
                socket.emit('piece:drag', pendingDrag);
                pendingDrag = null;
                dragRaf = null;
            }

            function pointerMove(moveEvent) {
                if (!dragState) return;
                const x = (moveEvent.clientX - rect.left) / scale - panState.translateX - dragState.offsetX;
                const y = (moveEvent.clientY - rect.top) / scale - panState.translateY - dragState.offsetY;
                const maxLeft = Math.max(0, stage.clientWidth / zoomLevel - dragState.piece.clientWidth);
                const maxTop = Math.max(0, stage.clientHeight / zoomLevel - dragState.piece.clientHeight);
                dragState.piece.style.left = Math.max(0, Math.min(maxLeft, x)) + 'px';
                dragState.piece.style.top = Math.max(0, Math.min(maxTop, y)) + 'px';
                
                // ============ COLLABORATION: Broadcast piece drag ============
                if (playMode && socket && socket.connected) {
                    pendingDrag = {
                        pieceId: dragState.piece.dataset.entryId,
                        x: dragState.piece.style.left,
                        y: dragState.piece.style.top
                    };
                    if (!dragRaf) {
                        dragRaf = requestAnimationFrame(sendPendingDrag);
                    }
                }
                // ============ END COLLABORATION ============
            }

            function pointerUp() {
                dragState = null;
                if (dragRaf) {
                    sendPendingDrag();
                }
                document.removeEventListener('pointermove', pointerMove);
                document.removeEventListener('pointerup', pointerUp);
                if (isBoardBeingEdited()) {
                    setBoardDirty(true);
                } else if (lastCreatedBoardId && socket && socket.connected) {
                    lobbyPublishBoard(lastCreatedBoardId);
                }
            }

            document.addEventListener('pointermove', pointerMove);
            document.addEventListener('pointerup', pointerUp);
        }

        function updateSelectedPiece() {
            if (!selectedPiece) return;
            selectedPiece.style.width = sizeSlider.value + 'px';
            selectedPiece.style.height = selectedPiece.dataset.type === 'card'
                ? Math.round(sizeSlider.value * 1.4) + 'px'
                : sizeSlider.value + 'px';
            selectedPiece.dataset.rotation = rotateSlider.value;
            selectedPiece.style.transform = `rotate(${rotateSlider.value}deg)`;
            selectedPiece.style.opacity = opacitySlider.value / 100;

            if (isBoardBeingEdited()) {
                setBoardDirty(true);
            } else if (socket && socket.connected && selectedPiece && selectedPiece.dataset.entryId) {
                socket.emit('piece:update', {
                    entryId: selectedPiece.dataset.entryId,
                    width: selectedPiece.style.width,
                    height: selectedPiece.style.height,
                    rotation: selectedPiece.dataset.rotation,
                    opacity: selectedPiece.style.opacity,
                    zIndex: selectedPiece.style.zIndex
                });
            }
        }

        sizeSlider.addEventListener('input', updateSelectedPiece);
        rotateSlider.addEventListener('input', updateSelectedPiece);
        opacitySlider.addEventListener('input', updateSelectedPiece);

        // when changing sides in the selected panel, update the selected dice piece
        selectedDiceSides.addEventListener('change', () => {
            if (!selectedPiece) return;
            if (selectedPiece.dataset.type === 'dice') {
                selectedPiece.dataset.sides = selectedDiceSides.value;
            }
        });

        bringFrontBtn.addEventListener('click', () => {
            if (!selectedPiece) return;
            selectedPiece.style.zIndex = ++zIndexCounter;
            if (isBoardBeingEdited()) {
                setBoardDirty(true);
            } else if (socket && socket.connected && selectedPiece.dataset.entryId) {
                socket.emit('piece:update', { entryId: selectedPiece.dataset.entryId, zIndex: selectedPiece.style.zIndex });
            }
        });

        sendBackBtn.addEventListener('click', () => {
            if (!selectedPiece) return;
            selectedPiece.style.zIndex = 1;
            if (isBoardBeingEdited()) {
                setBoardDirty(true);
            } else if (socket && socket.connected && selectedPiece.dataset.entryId) {
                socket.emit('piece:update', { entryId: selectedPiece.dataset.entryId, zIndex: selectedPiece.style.zIndex });
            }
        });

        removeComponentBtn.addEventListener('click', () => {
            if (!selectedPiece) return;
            if (isBoardBeingEdited()) {
                setBoardDirty(true);
            } else if (socket && socket.connected && selectedPiece.dataset.entryId) {
                socket.emit('piece:remove', { entryId: selectedPiece.dataset.entryId });
            }
            const entry = document.getElementById(selectedPiece.dataset.entryId);
            if (entry) entry.remove();
            selectedPiece.remove();
            selectedPiece = null;
            selectPiece(null);
            if (!currentBoardId && lastCreatedBoardId && socket && socket.connected) {
                setTimeout(() => lobbyPublishBoard(lastCreatedBoardId), 80);
            }
        });

        addComponentBtn.addEventListener('click', () => {
            const type = componentType.value;
            const label = componentName.value.trim() || `${type.charAt(0).toUpperCase() + type.slice(1)}`;
            const file = componentImageInput.files[0];
            const sides = componentType.value === 'dice' ? parseInt(diceSidesSelect.value, 10) : undefined;
            const stackCount = Math.max(1, Math.min(50, parseInt(stackCountInput.value, 10) || 1));

            const createStack = (imageData) => {
                const stackId = stackCount > 1 ? `stack-${Date.now()}-${Math.random().toString(36).slice(2)}` : null;
                for (let i = 0; i < stackCount; i += 1) {
                    const delta = i * 8;
                    const piece = createPiece(type, label, imageData, sides, null, stackId, i + 1);
                    piece.style.left = `${80 + delta}px`;
                    piece.style.top = `${80 + delta}px`;
                }
            };

            if (file) {
                const reader = new FileReader();
                reader.onload = () => createStack(reader.result);
                reader.readAsDataURL(file);
            } else {
                createStack(null);
            }
            componentName.value = '';
            componentImageInput.value = '';
        });

        if (saveBoardBtn) {
            saveBoardBtn.addEventListener('click', () => {
                const boardId = currentBoardId || lastCreatedBoardId;
                if (!boardId) {
                    showCollabToast('No board selected to save.');
                    return;
                }
                if (!socket || !socket.connected) {
                    showCollabToast('Cannot save board while offline.');
                    return;
                }
                lobbyPublishBoard(boardId);
                socket.emit('board:update', {
                    boardId,
                    message: `${displayName || 'A player'} saved new changes to the board.`
                });
                setBoardDirty(false);
                showCollabToast('Board saved and published.');
            });
        }

        if (restoreBoardBtn) {
            restoreBoardBtn.addEventListener('click', () => {
                if (!lastLoadedConfig) {
                    showCollabToast('No original board data to restore.');
                    return;
                }
                try { showLoading('Restoring board...'); } catch(e){}
                try {
                    loadLayout(lastLoadedConfig);
                    setBoardDirty(false);
                    showCollabToast('Board restored to original loaded state.');
                } finally { try { hideLoading(); } catch(e){} }
            });
        }

        stage.addEventListener('click', event => {
            if (event.target === stage || event.target === stageInner) selectPiece(null);
        });

        resetBtn.addEventListener('click', () => {
            stageInner.style.backgroundImage = 'none';
            boardImageInput.value = '';
            boardPreviewImage.src = '';
            boardPreviewImage.style.display = 'none';
            boardPreviewNoImage.style.display = 'block';
            boardColor.value = '#3a5f58';
            applyBoardStyles();
            stageInner.querySelectorAll('.piece').forEach(piece => piece.remove());
            componentList.innerHTML = '';
            selectedPiece = null;
            selectPiece(null);
        });

        exportDataBtn.addEventListener('click', () => {
            const pieces = Array.from(stage.querySelectorAll('.piece')).map(piece => ({
                type: piece.dataset.type,
                label: piece.dataset.label,
                left: piece.style.left,
                top: piece.style.top,
                width: piece.style.width,
                height: piece.style.height,
                rotation: piece.dataset.rotation || '0',
                opacity: piece.style.opacity,
                zIndex: piece.style.zIndex,
                image: piece.querySelector('img')?.src || null,
                sides: piece.dataset.sides || null
            }));
            const config = {
                boardColor: boardColor.value,
                hasBackgroundImage: stageInner.style.backgroundImage !== 'none',
                boardBackground: stageInner.style.backgroundImage ? stageInner.style.backgroundImage.slice(5, -2) : null,
                pieces
            };
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tabletopia-layout.json';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        });

        window.addEventListener('load', () => {
            applyBoardStyles();
            selectPiece(null);
            const leaveBtn = document.getElementById('leaveLobbyBtn');
            if (leaveBtn) leaveBtn.addEventListener('click', () => {
                // confirm
                if (confirm('Leave this lobby?')) {
                    lobbyLeaveBoard();
                }
            });
        });
    
