# Quick Start Guide for Tabletopia

## Install Node.js

You need Node.js 14+ installed first.

### Windows
1. Go to https://nodejs.org
2. Download the **LTS** version
3. Run the installer and follow steps
4. Restart your computer

### macOS
```bash
brew install node
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install nodejs npm
```

## Setup Tabletopia

After Node.js is installed:

1. **Open Terminal/PowerShell** in the `tabletopia` folder

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open browser**
   - Go to http://localhost:3000

5. **Test collaboration**
   - Open another browser tab to http://localhost:3000
   - You should see each other's cursors!

## Troubleshooting

**"npm: command not found"**
- Node.js not installed - download from https://nodejs.org
- Restart terminal/PowerShell after installing

**Port 3000 in use**
- Set different port: `PORT=3001 npm start`

**"Cannot find module" error**
- Run `npm install` again
- Delete `node_modules` folder and retry

## Next Steps

After confirming it works locally:

1. Upload to GitHub (see README.md)
2. Deploy to Heroku/Railway/Render
3. Share URL with collaborators

---

Questions? Check the README.md for detailed docs.
