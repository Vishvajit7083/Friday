export interface GeneratedProjectFile {
  relativePath: string;
  content: string;
}

export interface GeneratedCodeProject {
  projectName: string;
  language: 'web' | 'python' | 'c' | 'cpp' | 'node' | 'react';
  entryFile: string;
  files: GeneratedProjectFile[];
  summary: string;
}

export function buildLoginWebsiteProject(projectTitle = 'FridayAuthPortal'): GeneratedCodeProject {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectTitle} — Secure Sign In</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="auth-shell">
    <section class="auth-card" aria-labelledby="login-heading">
      <div class="brand-badge">PORTAL ACCESS</div>
      <h1 id="login-heading">Welcome Back</h1>
      <p class="subtitle">Sign in to continue to your workspace.</p>

      <form id="login-form" novalidate>
        <div class="field">
          <label for="email">Email Address</label>
          <input id="email" name="email" type="email" autocomplete="email" placeholder="alex@example.com" required />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <div class="password-row">
            <input id="password" name="password" type="password" autocomplete="current-password" minlength="6" placeholder="Minimum 6 characters" required />
            <button type="button" id="toggle-password" aria-label="Show password">Show</button>
          </div>
        </div>

        <div class="options-row">
          <label class="remember">
            <input type="checkbox" id="remember-me" />
            <span>Keep me signed in</span>
          </label>
          <a href="#reset" id="forgot-link">Forgot password?</a>
        </div>

        <p id="form-status" class="status" role="status" aria-live="polite"></p>
        <button type="submit" class="submit-btn">Sign In</button>
      </form>
    </section>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`;

  const css = `:root {
  color-scheme: dark;
  --bg: #070511;
  --card: rgba(18, 12, 36, 0.92);
  --border: rgba(168, 85, 247, 0.34);
  --accent: #a855f7;
  --accent-hover: #c084fc;
  --text: #f3e8ff;
  --muted: #b8a5d8;
  --error: #fb7185;
  --ok: #34d399;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: radial-gradient(circle at top, #1f113a 0%, var(--bg) 62%);
  color: var(--text);
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-shell {
  width: 100%;
  max-width: 420px;
}

.auth-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 32px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.brand-badge {
  display: inline-block;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: #e9d5ff;
  background: rgba(168, 85, 247, 0.18);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 14px;
}

h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.subtitle {
  margin: 0 0 22px;
  color: var(--muted);
  font-size: 14px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
}

.field input {
  width: 100%;
  padding: 11px 12px;
  border-radius: 10px;
  border: 1px solid rgba(168, 85, 247, 0.25);
  background: rgba(8, 6, 20, 0.85);
  color: var(--text);
  font-size: 14px;
}

.field input:focus {
  outline: 2px solid var(--accent);
  border-color: transparent;
}

.password-row {
  display: flex;
  gap: 8px;
}

.password-row button {
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(168, 85, 247, 0.14);
  color: var(--text);
  cursor: pointer;
}

.options-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-bottom: 14px;
}

.remember {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}

.options-row a {
  color: var(--accent-hover);
  text-decoration: none;
}

.status {
  min-height: 20px;
  margin: 0 0 12px;
  font-size: 13px;
}

.status.error {
  color: var(--error);
}

.status.ok {
  color: var(--ok);
}

.submit-btn {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  color: #090312;
  background: linear-gradient(135deg, #c084fc, #9333ea);
  cursor: pointer;
}

.submit-btn:hover {
  filter: brightness(1.08);
}
`;

  const js = `document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById('toggle-password');
  const forgotLink = document.getElementById('forgot-link');
  const statusEl = document.getElementById('form-status');

  if (!form || !emailInput || !passwordInput || !statusEl) return;

  const setStatus = (msg, kind) => {
    statusEl.textContent = msg;
    statusEl.className = kind ? 'status ' + kind : 'status';
  };

  toggleBtn?.addEventListener('click', () => {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    toggleBtn.textContent = showing ? 'Show' : 'Hide';
    toggleBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  forgotLink?.addEventListener('click', (e) => {
    e.preventDefault();
    setStatus('Password reset instructions can be configured in your backend auth route.', 'ok');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      setStatus('Please enter a valid email address.', 'error');
      emailInput.focus();
      return;
    }

    if (password.length < 6) {
      setStatus('Password must be at least 6 characters long.', 'error');
      passwordInput.focus();
      return;
    }

    setStatus('Client validation passed for ' + email + '. Ready to connect to your auth API.', 'ok');
  });
});
`;

  return {
    projectName: projectTitle,
    language: 'web',
    entryFile: 'index.html',
    files: [
      { relativePath: 'index.html', content: html },
      { relativePath: 'styles.css', content: css },
      { relativePath: 'app.js', content: js },
    ],
    summary: `Generated responsive login page project (${projectTitle}) with HTML5 semantics, accessible labels, CSS styling, and JavaScript validation.`,
  };
}

export function buildStaticWebsiteProject(topic = 'LandingPage'): GeneratedCodeProject {
  const safeTitle = topic.replace(/[^\w\s-]/g, '').trim() || 'ShowcasePage';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="hero">
    <nav class="nav">
      <span class="logo">${safeTitle}</span>
      <a href="#features" class="cta-link">Features</a>
    </nav>
    <div class="hero-content">
      <h1>${safeTitle}</h1>
      <p>Clean, fast, offline-ready web starter scaffolded by F.R.I.D.A.Y.</p>
      <button type="button" id="action-btn">Explore Workspace</button>
      <p id="action-output" role="status"></p>
    </div>
  </header>
  <section id="features" class="grid">
    <article class="card"><h2>Responsive</h2><p>Fluid grid layout for desktop and mobile viewports.</p></article>
    <article class="card"><h2>Accessible</h2><p>Semantic landmarks, contrast ratios, and keyboard focus.</p></article>
    <article class="card"><h2>Verified</h2><p>Checked for HTML, CSS, and JavaScript syntax integrity.</p></article>
  </section>
  <script src="./app.js"></script>
</body>
</html>
`;
  const css = `body{margin:0;font-family:system-ui,sans-serif;background:#090514;color:#f5f3ff}
.nav{display:flex;justify-content:space-between;align-items:center;padding:20px 32px;border-bottom:1px solid rgba(168,85,247,.25)}
.logo{font-weight:700;letter-spacing:.08em}
.cta-link{color:#d8b4fe;text-decoration:none}
.hero-content{max-width:720px;margin:56px auto 32px;padding:0 24px;text-align:center}
#action-btn{padding:12px 22px;border-radius:10px;border:none;background:#a855f7;color:#090514;font-weight:700;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:960px;margin:0 auto 48px;padding:0 24px}
.card{padding:20px;border-radius:14px;background:rgba(24,14,44,.85);border:1px solid rgba(168,85,247,.3)}
`;
  const js = `document.getElementById('action-btn')?.addEventListener('click',()=>{const out=document.getElementById('action-output');if(out)out.textContent='Workspace verified and active.';});\n`;
  return {
    projectName: safeTitle,
    language: 'web',
    entryFile: 'index.html',
    files: [
      { relativePath: 'index.html', content: html },
      { relativePath: 'styles.css', content: css },
      { relativePath: 'app.js', content: js },
    ],
    summary: `Generated web project "${safeTitle}" with HTML, CSS, and JavaScript.`,
  };
}

export function buildSingleLanguageProgram(
  language: 'c' | 'cpp' | 'python' | 'node',
  goalText = ''
): GeneratedCodeProject {
  const lower = goalText.toLowerCase();
  if (language === 'c') {
    const isCalc = /calc|add|sum/.test(lower);
    const content = isCalc
      ? `#include <stdio.h>\n\nint main(void) {\n    int a = 12, b = 8;\n    printf("Sum of %d and %d is %d\\n", a, b, a + b);\n    return 0;\n}\n`
      : `#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World from F.R.I.D.A.Y. C Automation!\\n");\n    return 0;\n}\n`;
    return {
      projectName: 'c-program',
      language: 'c',
      entryFile: 'main.c',
      files: [{ relativePath: 'main.c', content }],
      summary: 'Generated C program (main.c).',
    };
  }
  if (language === 'cpp') {
    const content = `#include <iostream>\n\nint main() {\n    std::cout << "Hello, World from F.R.I.D.A.Y. C++ Automation!" << std::endl;\n    return 0;\n}\n`;
    return {
      projectName: 'cpp-program',
      language: 'cpp',
      entryFile: 'main.cpp',
      files: [{ relativePath: 'main.cpp', content }],
      summary: 'Generated C++ program (main.cpp).',
    };
  }
  if (language === 'python') {
    const content = `def main() -> None:\n    print("Hello from F.R.I.D.A.Y. Python Automation!")\n\nif __name__ == "__main__":\n    main()\n`;
    return {
      projectName: 'python-script',
      language: 'python',
      entryFile: 'main.py',
      files: [{ relativePath: 'main.py', content }],
      summary: 'Generated Python script (main.py).',
    };
  }
  const content = `console.log("Hello from F.R.I.D.A.Y. Node.js Automation!");\n`;
  return {
    projectName: 'node-script',
    language: 'node',
    entryFile: 'index.mjs',
    files: [{ relativePath: 'index.mjs', content }],
    summary: 'Generated Node.js script (index.mjs).',
  };
}

export interface StaticCodeDiagnostic {
  file: string;
  severity: 'error' | 'warning';
  message: string;
  fixable: boolean;
}

export function validateWebCodeStatic(files: GeneratedProjectFile[]): {
  valid: boolean;
  diagnostics: StaticCodeDiagnostic[];
} {
  const diagnostics: StaticCodeDiagnostic[] = [];

  for (const f of files) {
    const ext = f.relativePath.split('.').pop()?.toLowerCase() || '';
    if (ext === 'html' || ext === 'htm') {
      if (!/<html[\s>]/i.test(f.content) || !/<\/html>/i.test(f.content)) {
        diagnostics.push({
          file: f.relativePath,
          severity: 'error',
          message: 'Missing root <html> or closing </html> tag.',
          fixable: true,
        });
      }
      if (!/<body[\s>]/i.test(f.content) || !/<\/body>/i.test(f.content)) {
        diagnostics.push({
          file: f.relativePath,
          severity: 'error',
          message: 'Missing <body> or closing </body> tag.',
          fixable: true,
        });
      }
    } else if (ext === 'js' || ext === 'mjs') {
      try {
        // Basic structural syntax parse via Function constructor without executing code
        new Function(f.content);
      } catch (err) {
        diagnostics.push({
          file: f.relativePath,
          severity: 'error',
          message: `JavaScript syntax issue: ${(err as Error).message}`,
          fixable: true,
        });
      }
    } else if (ext === 'css') {
      const opens = (f.content.match(/\{/g) || []).length;
      const closes = (f.content.match(/\}/g) || []).length;
      if (opens !== closes) {
        diagnostics.push({
          file: f.relativePath,
          severity: 'error',
          message: `Unbalanced CSS braces (${opens} opening vs ${closes} closing).`,
          fixable: true,
        });
      }
    }
  }

  return {
    valid: diagnostics.filter((d) => d.severity === 'error').length === 0,
    diagnostics,
  };
}

export function autoFixWebProjectFiles(files: GeneratedProjectFile[]): {
  fixedFiles: GeneratedProjectFile[];
  appliedFixes: string[];
} {
  const appliedFixes: string[] = [];
  const fixedFiles = files.map((f) => {
    const ext = f.relativePath.split('.').pop()?.toLowerCase() || '';
    let content = f.content;

    if (ext === 'html' || ext === 'htm') {
      if (/<body[\s>]/i.test(content) && !/<\/body>/i.test(content)) {
        content = `${content}\n</body>`;
        appliedFixes.push(`Added missing </body> in ${f.relativePath}`);
      }
      if (/<html[\s>]/i.test(content) && !/<\/html>/i.test(content)) {
        content = `${content}\n</html>`;
        appliedFixes.push(`Added missing </html> in ${f.relativePath}`);
      }
    } else if (ext === 'css') {
      const opens = (content.match(/\{/g) || []).length;
      const closes = (content.match(/\}/g) || []).length;
      if (opens > closes) {
        content = `${content}\n${'}'.repeat(opens - closes)}\n`;
        appliedFixes.push(`Balanced ${opens - closes} unclosed CSS block(s) in ${f.relativePath}`);
      }
    } else if (ext === 'js' || ext === 'mjs') {
      const opens = (content.match(/\{/g) || []).length;
      const closes = (content.match(/\}/g) || []).length;
      if (opens > closes) {
        content = `${content}\n${'}'.repeat(opens - closes)}\n`;
        appliedFixes.push(`Closed ${opens - closes} unclosed JS block(s) in ${f.relativePath}`);
      }
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens > closeParens) {
        content = `${content}${')'.repeat(openParens - closeParens)};\n`;
        appliedFixes.push(`Closed ${openParens - closeParens} unclosed JS parenthesis in ${f.relativePath}`);
      }
    }
    return { ...f, content };
  });
  return { fixedFiles, appliedFixes };
}
