# mitmweb — Web Interface

mitmweb is the browser-based UI for mitmproxy. It has two parts:

- **Server:** [`mitmproxy/tools/web`](../mitmproxy/tools/web) — the Python backend, served by `mitmweb`.
- **Client:** `web` (this directory) — the React/TypeScript frontend, built with [Vite](https://vitejs.dev/).

There are two ways to run it locally:

- **Development** — run the Vite dev server (`npm start`) for hot-reloading while you hack on the frontend.
- **Production** — build the static bundle once (`npm run ci-build-release`); `mitmweb` then serves it directly.

## Prerequisites

You need two toolchains installed. The commands below are otherwise identical on every OS unless noted.

- **[uv](https://docs.astral.sh/uv/)** — manages the Python environment for mitmproxy.
- **[Node.js](https://nodejs.org/) 24 or newer** — run `node --version` to check.

#### Linux

```shell
# uv (see https://docs.astral.sh/uv/getting-started/installation/)
curl -LsSf https://astral.sh/uv/install.sh | sh
# Node.js — use your distro's package manager or nvm (https://github.com/nvm-sh/nvm)
nvm install 24
```

#### macOS

```shell
brew install uv node
# or install uv via the official installer:
# curl -LsSf https://astral.sh/uv/install.sh | sh
```

#### Windows

Use PowerShell:

```powershell
# uv (see https://docs.astral.sh/uv/getting-started/installation/)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
# Node.js — install the LTS (>=24) MSI from https://nodejs.org/ or use winget:
winget install OpenJS.NodeJS.LTS
```

## Development setup

From the repository root:

```shell
# 1. Set up the Python environment (creates .venv and installs mitmproxy).
uv run mitmproxy --version

# 2. Install the frontend dependencies.
cd web
npm install
```

Then run the two processes in **separate terminals**:

```shell
# Terminal 1 — the mitmproxy backend + web server (from the repo root).
uv run mitmweb

# Terminal 2 — the Vite dev server for the frontend (from ./web).
npm start
```

`npm start` prints a local URL (Vite's default is <http://127.0.0.1:5173/>). Open it
in your browser — it hot-reloads on source changes and proxies API/WebSocket traffic
to the `mitmweb` backend on port 8081, so you get live updates without rebuilding.

> The Vite dev server is for frontend development only. To exercise the UI exactly
> as shipped, build the production bundle (below) and open the URL that `mitmweb`
> itself prints (default <http://127.0.0.1:8081/>).

## Building the production bundle

`npm run ci-build-release` deletes the old assets in
[`mitmproxy/tools/web/static`](../mitmproxy/tools/web/static) and rebuilds them with
Vite. `mitmweb` serves whatever is in that directory, so after a build just run
`uv run mitmweb` and open the URL it prints.

#### Linux / macOS

```shell
cd web
npm run ci-build-release
```

#### Windows

The `ci-build-release` script uses the POSIX `rm -rf`, which is unavailable in
`cmd.exe`/PowerShell. Either run the script from **Git Bash** or **WSL**, or delete
the folder and build manually:

```powershell
cd web
Remove-Item -Recurse -Force ..\mitmproxy\tools\web\static
npx vite build
```

Then serve the freshly built UI from the repository root:

```shell
uv run mitmweb
```

## Using mitmweb

Once mitmweb is running and you have traffic flowing through the proxy:

- **Flow list** — captured requests appear in a Charles-style tree. Select a flow to
  inspect it.
- **Request / Response / Req&Resp tabs** — view a message. Use the **Toggle Headers**
  button in the tab bar to show or hide the header block (hidden by default so the
  body is front and center).
- **JSON bodies** — a JSON request/response body renders as a collapsible,
  color-coded tree. Click the fold arrows (▾) to expand/collapse objects and arrays.
- **Editing JSON** — click **Edit**, then:
  - Click any key or value to edit it inline. **Enter** commits, **Escape** cancels,
    and clicking away commits. Values keep their JSON type (e.g. `42` stays a number,
    booleans become a dropdown). Use the add/delete controls to change entries.
  - Arrow keys move the caret **within** the field you are editing (they don't switch
    tabs while a field is focused).
  - Click **Raw** to edit the whole body as pretty-printed, multi-line JSON in a text
    editor; click **Tree** to switch back. **Done** saves your changes.

## Testing

```shell
npm test
```

This runs eslint, the type checker, and the Jest suite with coverage.

## Code formatting

```shell
npm run prettier
```

You can also integrate Prettier into your editor — see
<https://prettier.io/docs/en/editors.html>.

## Contributing

We very much appreciate any (small) improvements to mitmweb. Please do *not* include
the compiled assets in
[`mitmproxy/tools/web/static`](https://github.com/mitmproxy/mitmproxy/tree/main/mitmproxy/tools/web/static)
in your pull request. Refreshing them on every commit would massively increase
repository size. We will update these files before every release.

## Developer Tools

- You can debug application state using the
  [React DevTools](https://reactjs.org/blog/2019/08/15/new-react-devtools.html) and
  [Redux DevTools](https://github.com/reduxjs/redux-devtools) browser extensions.
