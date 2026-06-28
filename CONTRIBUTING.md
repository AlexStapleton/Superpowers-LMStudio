# Contributing to Beledarians LM Studio Toolbox

First off, thank you for considering contributing to this project! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.


## 🐛 Reporting Bugs

If you find a bug, please create an Issue on GitHub. Include:
* A clear title and description.
* Steps to reproduce the bug.
* The expected behavior vs. actual behavior.

## 🛠 Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone [https://github.com/your-username/Beledarians_LM_Studio_Toolbox.git](https://github.com/your-username/Beledarians_LM_Studio_Toolbox.git)
    cd Beledarians_LM_Studio_Toolbox
    ```
3.  **Install dependencies** (ensure you have Node.js installed):
    ```bash
    npm install
    ```
---
## Development
If you want to contribute to the development of this plugin, you can follow these steps:

Clone the repository:
```bash
git clone https://github.com/Beledarian/Beledarians_LM_Studio_Toolbox.git
cd Beledarians_LM_Studio_Toolbox
```
Install dependencies:

```bash
npm install
```
Run in development mode: From within the project directory, run the following command:
```bash
lms dev
```
This will start the plugin in development mode. LM Studio should automatically pick it up. Any changes you make to the source code will cause the plugin to automatically reload.

---

## 🔄 The Workflow (How to Submit Changes)

To keep the history clean and ensure quality, please follow this workflow:

1.  **Create a Branch:** Never work directly on `main`. Create a descriptive branch for your feature or fix:
    ```bash
    git checkout -b feature/amazing-new-tool
    # or
    git checkout -b fix/annoying-bug
    ```
2.  **Make your changes:** Write your code and ensure it follows the project's style.
    
3.  **Commit your changes:** Use clear, descriptive commit messages.
    ```bash
    git commit -m "feat: add token counter utility"
    ```
4.  **Run full testsuite and add tests:**
    ```bash
    npm test
    ```
    Ensure all exsisting test pass and you add regression/ feature tests for the feature/ tools you added.
  
5.  **Push to your fork:**
    ```bash
    git push origin feature/amazing-new-tool
    ```
6.  **Open a Pull Request:** Go to the original repository and click "Compare & pull request." Provide a clear description of what you changed and why.

## 🧠 Authoring a Workflow Skill

Workflow "skills" are the procedures the plugin routes a user's request to (TDD, debugging,
verification, …). Each skill is a single Markdown file in [`skills/`](skills/) with YAML-ish
frontmatter followed by the procedure body. The whole system is built so that **the code — not the
small model's judgment — decides which skill fires**, so the frontmatter is load-bearing.

### File format

```markdown
---
name: my-skill                 # unique, kebab-case; matches the filename
description: Use to <do X> — <when to reach for it, vs neighbours>   # one line; also the semantic-router embedding text
announce: My Skill             # the phrase the model must echo: "Using My Skill —"
priority: 0                    # routing precedence when triggers overlap (higher wins). Default 0.
triggers:                      # case-insensitive JS regexes; the keyword router fires on the first match
  - "\\bmy skill\\b"
  - "do the (thing|task)"
examples:                      # natural-phrasing prompts that MUST route here — asserted by the eval
  - "please do the thing"
  - "can you run my skill on this"
---

Before doing anything else — including any tool call — output the line: "Using My Skill —". Then proceed.

<the procedure: numbered, imperative, checklist-style. Short beats prose for a 12B.>
```

### Field rules

- **`name`** — unique across all skills, kebab-case, equals the filename stem.
- **`description`** — one line. This is also the text embedded by the semantic router, so phrase it to
  *separate* the skill from its neighbours (e.g. "look something up" vs "run-and-check" vs "integrate").
- **`announce`** — the human-readable phase name; the body must instruct the model to print `Using <announce> —`.
- **`priority`** — integer, default `0`. When two skills' triggers both match a prompt, the higher
  priority wins (ties break alphabetically). Process/discipline **gates** outrank implementation skills:
  `verification`/`brainstorming`/`debugging`/`tdd` = `20`, planning/review = `10`, everything else `0`.
  Set this when your skill must run *before* the work it gates.
- **`triggers`** — JavaScript regexes, matched case-insensitively against the user prompt. Favour
  **high precision** over recall: a false positive fires a workflow on a benign message, which derails
  small models. The semantic router is the recall backstop, so you don't need to enumerate every phrasing.
- **`examples`** — natural prompts that should route to this skill. These are not decoration: the
  routing eval asserts every example routes to its own skill and that benign prompts route nowhere.

### Before you open the PR

```bash
npm run build && npm run validate-skills   # every regex compiles, fields present, names unique, examples exist
npm test                                   # includes the routing test: each example routes to its own skill
```

If you have an LM Studio chat model (and optionally an embedding model) running locally, you can also
measure real adherence/routing with `npm run eval` (see [`eval/`](eval/)). A bad skill must fail loudly
in CI — never route silently to nothing.

## 🎨 Coding Standards

Since this project uses **TypeScript**, please adhere to the following:

* **Strict Typing:** Avoid using `any` whenever possible. Define interfaces/types for your data structures.
* **Clarity:** Variable and function names should be self-explanatory.
* **Formatting:** If available, run the linter/formatter before committing.

## Questions?

Open an issue or start a discussion. I'm happy to help!

## License

By contributing to this project you agree that any of your contributions will be licensed under the [GNU General Public License v3.0 or later](LICENSE). This is the same license as the project itself.

Any contribution submitted for inclusion in this project by you shall be licensed as above, without any additional terms or conditions.


Thank you for your contributions!
