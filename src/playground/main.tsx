import { createRoot } from 'react-dom/client';
import { useState } from 'react';

// The playground has no extension APIs, so the real broker saves to this page's localStorage.
const PREFIX = 'vellum-playground:';
(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: {
      async get(keys: string[] | null) {
        const names = keys ?? Object.keys(localStorage)
          .filter(key => key.startsWith(PREFIX)).map(key => key.slice(PREFIX.length));
        const result: Record<string, unknown> = {};
        for (const name of names) {
          const raw = localStorage.getItem(PREFIX + name);
          if (raw !== null) result[name] = JSON.parse(raw);
        }
        return result;
      },
      async set(items: Record<string, unknown>) {
        for (const [name, value] of Object.entries(items)) localStorage.setItem(PREFIX + name, JSON.stringify(value));
      },
    },
  },
};

function ReviewButton() {
  const [count, setCount] = useState(0);
  return <>
    <button onClick={() => setCount(count + 1)}>Review project</button>
    <p className="count">Clicks: {count}</p>
  </>;
}

function Overview() {
  return <main>
    <p className="eyebrow">DESIGN REVIEW</p>
    <h1>A clearer way to review.</h1>
    <p className="intro">Select an element, capture your feedback, and copy the context when you are ready.</p>
    <section className="panel" aria-label="Project overview">
      <h2>Website refresh</h2>
      <p>Review the spacing, content, and interaction details.</p>
      <ReviewButton />
    </section>
  </main>;
}

function Projects() {
  return <main>
    <p className="eyebrow">PROJECTS</p>
    <h1>Projects</h1>
    {['Website refresh', 'Mobile onboarding', 'Billing settings'].map(name =>
      <section className="panel" key={name}><h2>{name}</h2><p>Open for review.</p></section>)}
  </main>;
}

function Site() {
  return <>
    <header>
      <strong>Workspace</strong>
      <nav><a href="/">Overview</a><a href="/projects">Projects</a></nav>
    </header>
    {location.pathname.startsWith('/projects') ? <Projects /> : <Overview />}
  </>;
}

createRoot(document.querySelector('#app')!).render(<Site />);

await import('../extension/broker');
await import('../extension/page');
await window.__vellumExtension?.start(true);
