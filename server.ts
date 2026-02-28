import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("nexus.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get all connections
  app.get("/api/connections", (req, res) => {
    const connections = db.prepare("SELECT id, provider, created_at FROM connections").all();
    res.json(connections);
  });

  // GitHub OAuth URL
  app.get("/api/auth/github/url", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "GITHUB_CLIENT_ID not configured" });
    }
    const redirectUri = `${process.env.APP_URL}/api/auth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user`;
    res.json({ url });
  });

  // GitHub OAuth Callback
  app.get("/api/auth/github/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const data = await tokenResponse.json();
      if (data.error) throw new Error(data.error_description || data.error);

      // Store connection
      db.prepare(`
        INSERT OR REPLACE INTO connections (id, provider, access_token)
        VALUES (?, ?, ?)
      `).run("github", "github", data.access_token);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>GitHub connected successfully. Closing window...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("GitHub OAuth error:", error);
      res.status(500).send(`Auth failed: ${error.message}`);
    }
  });

  // Google OAuth URL
  app.get("/api/auth/google/url", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured" });
    }
    const redirectUri = `${process.env.APP_URL}/api/auth/google/callback`;
    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid"
    ].join(" ");
    
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
    res.json({ url });
  });

  // Google OAuth Callback
  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${process.env.APP_URL}/api/auth/google/callback`,
        }),
      });

      const data = await tokenResponse.json();
      if (data.error) throw new Error(data.error_description || data.error);

      // Store connection
      db.prepare(`
        INSERT OR REPLACE INTO connections (id, provider, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("google", "google", data.access_token, data.refresh_token, Date.now() + (data.expires_in * 1000));

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'google' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Google connected successfully. Closing window...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google OAuth error:", error);
      res.status(500).send(`Auth failed: ${error.message}`);
    }
  });

  // Notion OAuth URL
  app.get("/api/auth/notion/url", (req, res) => {
    const clientId = process.env.NOTION_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: "NOTION_CLIENT_ID not configured" });
    }
    const redirectUri = `${process.env.APP_URL}/api/auth/notion/callback`;
    const url = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&owner=user`;
    res.json({ url });
  });

  // Notion OAuth Callback
  app.get("/api/auth/notion/callback", async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    try {
      const auth = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString("base64");
      const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: `${process.env.APP_URL}/api/auth/notion/callback`,
        }),
      });

      const data = await tokenResponse.json();
      if (data.error) throw new Error(data.error_description || data.error);

      // Store connection
      db.prepare(`
        INSERT OR REPLACE INTO connections (id, provider, access_token)
        VALUES (?, ?, ?)
      `).run("notion", "notion", data.access_token);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'notion' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Notion connected successfully. Closing window...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Notion OAuth error:", error);
      res.status(500).send(`Auth failed: ${error.message}`);
    }
  });

  // Disconnect provider
  app.post("/api/connections/:id/disconnect", (req, res) => {
    db.prepare("DELETE FROM connections WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Tool Execution API
  app.post("/api/tools/execute", async (req, res) => {
    const { tool, args } = req.body;
    
    try {
      if (tool === "list_github_repos") {
        const connection = db.prepare("SELECT access_token FROM connections WHERE id = ?").get("github") as any;
        if (!connection) return res.status(400).json({ error: "GitHub not connected" });

        const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=5", {
          headers: {
            Authorization: `token ${connection.access_token}`,
            "User-Agent": "Nexus-Agent",
          },
        });
        const repos = await response.json();
        return res.json(repos.map((r: any) => ({ name: r.name, url: r.html_url, description: r.description })));
      }

      if (tool === "create_github_issue") {
        const connection = db.prepare("SELECT access_token FROM connections WHERE id = ?").get("github") as any;
        if (!connection) return res.status(400).json({ error: "GitHub not connected" });

        const { repo, title, body } = args;
        const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: "POST",
          headers: {
            Authorization: `token ${connection.access_token}`,
            "User-Agent": "Nexus-Agent",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, body }),
        });
        const issue = await response.json();
        return res.json({ url: issue.html_url, number: issue.number });
      }

      if (tool === "send_gmail") {
        const connection = db.prepare("SELECT access_token FROM connections WHERE id = ?").get("google") as any;
        if (!connection) return res.status(400).json({ error: "Google not connected" });

        const { to, subject, body } = args;
        
        // Construct RFC 2822 message
        const message = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          body
        ].join('\n');

        const encodedMessage = Buffer.from(message)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${connection.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: encodedMessage,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || "Failed to send email");
        }

        const result = await response.json();
        return res.json({ success: true, id: result.id });
      }

      res.status(404).json({ error: "Tool not found" });
    } catch (error: any) {
      console.error("Tool execution error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
