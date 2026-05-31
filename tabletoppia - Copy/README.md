# Tabletopia Creator - Collaborative Board Game Designer

A real-time collaborative web app for creating and managing custom board game layouts. Multiple users can work on the same board simultaneously with live cursor tracking, piece highlighting, and synchronized board state.

## Features

✅ **Multi-User Collaboration**
- Real-time cursor tracking with random color assignment
- Live user list showing connected collaborators
- See what other users are selecting/dragging

✅ **Board Customization**
- Upload custom board images or use solid colors
- Create tokens, coins, dice, and cards
- Resize, rotate, and adjust opacity

✅ **Dice System**
- Support for 2-100 sided dice
- Roll animations and instant feedback
- Configurable per component

✅ **Play Mode**
- Enter fullscreen play mode (ESC to exit)
- Scroll to zoom in/out
- Drag to pan the board
- All pieces visible and interactive

✅ **Import/Export**
- Save board layouts as JSON
- Import previously saved layouts
- Share configurations with team members

## Installation

### Prerequisites
- Node.js 14+ 
- npm (comes with Node.js)
- Git

### Setup (Local Development)

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/tabletopia.git
   cd tabletopia
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   Server runs on `http://localhost:3000`

4. **Open in browser**
   - Go to `http://localhost:3000`
   - Open another browser tab/window to `http://localhost:3000` to test multi-user
   - You'll see each other's cursors and actions in real-time

## Usage

### Create a Board
1. Use the **Board** panel to upload an image or select a color
2. Add components (tokens, dice, cards) using the **Add Component** panel
3. Adjust size, rotation, and opacity for each piece
4. See all connected users in the toolbar

### Play Mode
- Click **Play** to enter fullscreen play mode
- **Scroll up/down** to zoom in/out
- **Drag** the board to pan around
- **Double-click** pieces to roll dice or flip cards
- **ESC** to exit play mode

### Collaboration
- Connected users appear in the top-right user list with their color
- Their cursor arrows show in real-time
- Selected pieces broadcast to all users

### Save & Share
- **Download Layout** - Save your board as JSON
- **Import Layout** - Load a previously saved board
- Share the JSON file with collaborators

## Deployment

### Option 1: Deploy to Heroku (Recommended for Beginners)

1. **Create Heroku account** at https://heroku.com

2. **Install Heroku CLI**
   - Download from https://devcenter.heroku.com/articles/heroku-cli

3. **Login to Heroku**
   ```bash
   heroku login
   ```

4. **Create Heroku app**
   ```bash
   heroku create tabletopia-YOUR_USERNAME
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```
   
   Your app is now live! Heroku provides a URL like `https://tabletopia-YOUR_USERNAME.herokuapp.com`

### Option 2: Deploy to Railway.app

1. Go to https://railway.app and sign up
2. Connect your GitHub repository
3. Railway auto-deploys on push to main
4. Set `PORT` environment variable to 3000

### Option 3: Deploy to Render

1. Go to https://render.com and sign up
2. Create new Web Service
3. Connect GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`

### Option 4: Self-Hosted (VPS/Dedicated Server)

1. SSH into your server
2. Install Node.js and Git
3. Clone your repo
4. Run `npm install && npm start`
5. Use PM2 to keep server running:
   ```bash
   npm install -g pm2
   pm2 start server.js
   ```

## Publishing to GitHub

1. **Create GitHub repository**
   - Go to https://github.com/new
   - Name it `tabletopia`

2. **Push your code**
   ```bash
   git add .
   git commit -m "Initial commit: collaborative board creator"
   git remote add origin https://github.com/YOUR_USERNAME/tabletopia.git
   git branch -M main
   git push -u origin main
   ```

3. **Enable GitHub Pages** (optional - only shows static files, not the interactive app)
   - Go to repository settings
   - Select main branch as source
   - Your static site is available at `https://YOUR_USERNAME.github.io/tabletopia`

**Note:** GitHub Pages only hosts static files. For the full collaborative app to work, deploy using Heroku, Railway, Render, or a VPS.

## Invite Collaborators

1. **GitHub Collaboration**
   - Go to repository Settings → Collaborators
   - Add GitHub usernames to invite

2. **Share Deployed App**
   - Send the live URL to collaborators
   - No installation needed - they just visit in browser
   - Each user gets auto-assigned a random color

## Project Structure

```
tabletopia/
├── server.js                 # Node.js/Express backend
├── js.js                     # Frontend logic + Socket.io client
├── index.html                # Main UI
├── style.css                 # Styling
├── package.json              # Dependencies
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

## Technical Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Node.js, Express
- **Real-time:** Socket.io (WebSockets)
- **Browser APIs:** Fullscreen, Pointer Events, File Reader, Canvas

## How Collaboration Works

1. **Server** (server.js) uses Socket.io to manage connected users
2. Each user gets assigned a random color from a preset palette
3. **Cursor tracking** - Mouse position emitted 60fps to all clients
4. **Piece updates** - Drag, select, and board changes broadcast in real-time
5. **User list** - Connected users displayed with their color badge

## Troubleshooting

**Q: Cursor arrows not showing?**
- Make sure Socket.io connection is active (check browser console)
- Verify server is running: `npm start`

**Q: Other users not visible?**
- Refresh browser (F5)
- Check all users are on same deployed URL
- If self-hosted, ensure Socket.io CORS is configured

**Q: Port 3000 already in use?**
- Change port: `PORT=3001 npm start`
- Or kill process using port 3000

## Future Enhancements

- [ ] Undo/Redo history
- [ ] Board chat
- [ ] Voice/Video integration
- [ ] Advanced permissions (read-only users)
- [ ] Undo that works across users
- [ ] More dice options (3D dice, custom faces)

## License

MIT License - feel free to use and modify!

## Questions?

Open an issue on GitHub or check console logs for errors.

---

**Happy building! 🎲**
